/*!
 * Copyright (c) 2018, imqueue.com <support@imqueue.com>
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 * OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */
import type { IMQRPCRequest } from '@imqueue/rpc';
import {
    clientChannels,
    DDChannel,
    ImqCallContext,
    serverChannels,
} from './channels.js';

/**
 * Key inside `request.metadata` the propagated trace context travels in. Kept
 * as it always was, so a service running this package still understands calls
 * made by a client running an older release, and the other way round.
 */
export const CARRIER_KEY = 'clientSpan';

/**
 * The pair of hooks @imqueue/rpc invokes around a call. Structurally equal to
 * `IMQBeforeCall`/`IMQAfterCall`, but expressed without a type parameter so the
 * same shape works for both client and service option objects.
 */
export interface CallHooks {
    beforeCall: (req?: IMQRPCRequest, res?: any) => Promise<void>;
    afterCall: (req?: IMQRPCRequest, res?: any) => Promise<void>;
}

/** Marker telling an already instrumented options object from a fresh one. */
const PATCHED = '__imqueueDdTracePatched';

/**
 * Property an in-flight call's context is kept under, on the request itself, so
 * that `afterCall` can finish the span `beforeCall` started. Never serialized,
 * see `hideContextFromJson()`.
 */
export const CALL_CONTEXT = Symbol.for('@imqueue/dd-trace:context');

const CONTEXT = CALL_CONTEXT;

interface Channels {
    start: DDChannel;
    error: DDChannel;
    finish: DDChannel;
}

/**
 * Reads the trace-context carrier out of a request, if the caller put one
 * there. `metadata` is an `IMQMetadata` instance whose properties are plain
 * JSON, so the carrier survives serialization as an ordinary object.
 *
 * @param {IMQRPCRequest} req - request to read from
 * @return {Record<string, string> | undefined}
 */
function readCarrier(req: IMQRPCRequest): Record<string, string> | undefined {
    const carrier = (req.metadata as any)?.[CARRIER_KEY];

    return carrier && typeof carrier === 'object' ? carrier : undefined;
}

/**
 * Attaches a fresh, empty carrier to a request for the client to inject the
 * current trace context into.
 *
 * @param {IMQRPCRequest} req - request to extend
 * @return {Record<string, string>}
 */
function createCarrier(req: IMQRPCRequest): Record<string, string> {
    const metadata: any = (req as any).metadata || ((req as any).metadata = {});
    const carrier: Record<string, string> = {};

    metadata[CARRIER_KEY] = carrier;

    return carrier;
}

/**
 * Keeps the request serializable: the span object hanging off the context must
 * never reach the queue.
 *
 * @param {IMQRPCRequest} req - request to guard
 */
function hideContextFromJson(req: IMQRPCRequest): void {
    if (typeof (req as any).toJSON === 'function') {
        return;
    }

    (req as any).toJSON = () => {
        const copy: any = { ...(req as any) };

        delete copy[CONTEXT];
        delete copy.span;

        return copy;
    };
}

/**
 * Builds the hook pair publishing on the given channels.
 *
 * @param {Channels} channels - channels of the traced operation
 * @param {(req: IMQRPCRequest, self: any) => string} serviceNameOf - resolves
 *        the service name to report, given the request and the hook's `this`
 * @param {boolean} injects - whether the hooks should create a carrier for the
 *        trace context (client) or read the one already present (server)
 * @return {CallHooks}
 */
function createHooks(
    channels: Channels,
    serviceNameOf: (req: IMQRPCRequest, self: any) => string,
    injects: boolean,
): CallHooks {
    async function beforeCall(
        this: any,
        req?: IMQRPCRequest,
    ): Promise<void> {
        if (!req || !channels.start.hasSubscribers) {
            return;
        }

        hideContextFromJson(req);

        const ctx: ImqCallContext = {
            serviceName: serviceNameOf(req, this),
            method: req.method,
            from: req.from,
            carrier: injects ? createCarrier(req) : readCarrier(req),
        };

        (req as any)[CONTEXT] = ctx;

        channels.start.publish(ctx);
    }

    async function afterCall(
        this: any,
        req?: IMQRPCRequest,
        res?: any,
    ): Promise<void> {
        const ctx: ImqCallContext | undefined = req && (req as any)[CONTEXT];

        if (!ctx) {
            return;
        }

        delete (req as any)[CONTEXT];

        const error = res?.error;

        if (error) {
            ctx.error = error;
            channels.error.publish(ctx);
        }

        channels.finish.publish(ctx);
    }

    return { beforeCall, afterCall };
}

/**
 * Installs the hooks into an @imqueue/rpc default options object.
 *
 * Hooks the user configured themselves are preserved and invoked after the
 * tracing ones, so enabling tracing never silently drops application
 * behaviour. Calling this twice on the same object is a no-op.
 *
 * @param {any} options - `DEFAULT_IMQ_CLIENT_OPTIONS` or
 *        `DEFAULT_IMQ_SERVICE_OPTIONS`
 * @param {CallHooks} hooks - hooks to install
 * @return {boolean} - whether anything was installed
 */
export function installHooks(options: any, hooks: CallHooks): boolean {
    if (!options || options[PATCHED]) {
        return false;
    }

    for (const name of ['beforeCall', 'afterCall'] as const) {
        const existing = options[name];
        const traced = hooks[name];

        options[name] = typeof existing === 'function'
            ? async function(this: any, ...args: any[]): Promise<void> {
                await traced.apply(this, args as any);
                await existing.apply(this, args);
            }
            : traced;
    }

    Object.defineProperty(options, PATCHED, {
        value: true,
        enumerable: false,
    });

    return true;
}

/**
 * Hooks tracing incoming calls, reading the propagated context from the
 * request. `this` is the `IMQService` instance, whose `name` identifies it.
 */
export const serverHooks: CallHooks = createHooks(
    serverChannels,
    (req, self) => self?.name || 'imq',
    false,
);

/**
 * Hooks tracing outgoing calls, injecting the current context into the
 * request. `this` is the `IMQClient` instance, whose `serviceName` names the
 * service being called.
 */
export const clientHooks: CallHooks = createHooks(
    clientChannels,
    (req, self) => self?.serviceName || 'imq',
    true,
);
