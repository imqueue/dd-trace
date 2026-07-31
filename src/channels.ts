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
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * The subset of a diagnostics channel this package relies on. Channels are
 * taken from dd-trace itself rather than from `node:diagnostics_channel` so
 * that publisher and subscriber are guaranteed to be the very same channel
 * object the tracer's plugins subscribe to.
 */
export interface DDChannel {
    /**
     * Whether anything is listening. Checked before building a call context, so
     * that a process with tracing disabled pays nothing per RPC beyond this
     * read.
     */
    readonly hasSubscribers: boolean;

    /**
     * Publishes an event to the subscribed plugins. Synchronous: subscribers
     * run before this returns, which is what lets a plugin attach its span to
     * the context the caller is about to use.
     */
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
