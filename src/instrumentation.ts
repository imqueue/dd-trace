/*!
 * I'm Queue Software Project
 * Copyright (C) 2025  imqueue.com <support@imqueue.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * If you want to use this code in a closed source (commercial) project, you can
 * purchase a proprietary commercial license. Please contact us at
 * <support@imqueue.com> to get commercial licensing options.
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
 * The pair of hooks `@imqueue/rpc` invokes around a call. Structurally equal to
 * `IMQBeforeCall`/`IMQAfterCall`, but expressed without a type parameter so the
 * same shape works for both client and service option objects.
 */
export interface CallHooks {
    /**
     * Runs before the call. Builds the call context, attaches it to the
     * request, and publishes the `start` event. Returns immediately when the
     * channel has no subscribers.
     */
    beforeCall: (req?: IMQRPCRequest, res?: any) => Promise<void>;

    /**
     * Runs after the call. Publishes `error` when the response carries one,
     * then always publishes `finish` so the span is closed either way.
     */
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
 * @param req - request to read from
 * @returns the carrier, or nothing when the caller propagated no context
 */
function readCarrier(req: IMQRPCRequest): Record<string, string> | undefined {
    const carrier = (req.metadata as any)?.[CARRIER_KEY];

    return carrier && typeof carrier === 'object' ? carrier : undefined;
}

/**
 * Attaches a fresh, empty carrier to a request for the client to inject the
 * current trace context into.
 *
 * @param req - request to extend
 * @returns the empty carrier just attached
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
 * @param req - request to guard
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
 * @param channels - channels of the traced operation
 * @param serviceNameOf - resolves the service name to report, given the request
 *         and the hook's `this`
 * @param injects - whether the hooks should create a carrier for the trace
 *         context (client) or read the one already present (server)
 * @returns the hook pair to install
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
 * Installs the hooks into an `@imqueue/rpc` default options object.
 *
 * Hooks the user configured themselves are preserved and invoked after the
 * tracing ones, so enabling tracing never silently drops application behaviour.
 * Calling this twice on the same object is a no-op.
 *
 * @param options - `DEFAULT_IMQ_CLIENT_OPTIONS` or
 * `DEFAULT_IMQ_SERVICE_OPTIONS`
 * @param hooks - hooks to install
 * @returns `true` if this call installed them, `false` if the object was
 *         already instrumented
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
 * Hooks tracing outgoing calls, injecting the current context into the request.
 * `this` is the `IMQClient` instance, whose `serviceName` names the service
 * being called.
 */
export const clientHooks: CallHooks = createHooks(
    clientChannels,
    (req, self) => self?.serviceName || 'imq',
    true,
);
