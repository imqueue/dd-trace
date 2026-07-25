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
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * The subset of a diagnostics channel this package relies on. Channels are
 * taken from dd-trace itself rather than from `node:diagnostics_channel` so
 * that publisher and subscriber are guaranteed to be the very same channel
 * object the tracer's plugins subscribe to.
 */
export interface DDChannel {
    readonly hasSubscribers: boolean;
    publish(ctx: unknown): void;
}

const { channel } = require(
    'dd-trace/packages/datadog-instrumentations/src/helpers/instrument.js',
) as { channel: (name: string) => DDChannel };

/**
 * Integration name. Together with the operation it forms the channel prefix
 * dd-trace plugins subscribe to (`apm:<component>:<operation>:<event>`), so it
 * has to stay in sync with the plugin classes in `./client` and `./server`.
 */
export const IMQ_COMPONENT = 'imq';

/** Operation traced on the calling side of an imq RPC call. */
export const CLIENT_OPERATION = 'request';

/** Operation traced on the handling side of an imq RPC call. */
export const SERVER_OPERATION = 'response';

/**
 * Everything the plugins need to describe a call. Instances are created by the
 * instrumentation in `./instrumentation` and travel through the channels; the
 * plugins add `span` to them and read it back when the call completes.
 */
export interface ImqCallContext {
    /** Name of the imq service the call belongs to. */
    serviceName: string;
    /** Name of the called method. */
    method: string;
    /** Queue name of the calling party, when the request carries one. */
    from?: string;
    /**
     * Carrier for the propagated trace context: the client writes into it, the
     * server reads from it. It travels as `request.metadata.clientSpan`.
     */
    carrier?: Record<string, string>;
    /** Span the plugin created for this call. Set by the plugin. */
    span?: any;
    /** Error the call failed with, if any. */
    error?: any;
}

/**
 * Builds the channel triple for one operation. The event names are the ones
 * `TracingPlugin` derives its subscriptions from.
 */
function channelsFor(operation: string) {
    const prefix = `apm:${IMQ_COMPONENT}:${operation}`;

    return {
        start: channel(`${prefix}:start`),
        error: channel(`${prefix}:error`),
        finish: channel(`${prefix}:finish`),
    };
}

/** Channels carrying client-side (outgoing call) events. */
export const clientChannels = channelsFor(CLIENT_OPERATION);

/** Channels carrying server-side (incoming call) events. */
export const serverChannels = channelsFor(SERVER_OPERATION);
