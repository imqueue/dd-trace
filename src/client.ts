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
import formats from 'dd-trace/ext/formats.js';
import tags from 'dd-trace/ext/tags.js';
import { CLIENT_OPERATION, IMQ_COMPONENT, ImqCallContext } from './channels.js';
import { TracingPlugin } from './internals.js';

/**
 * Traces outgoing @imqueue RPC calls.
 *
 * Subscribes to `apm:imq:request:{start,error,finish}` — the channels the
 * instrumentation in `./instrumentation` publishes from the client's
 * `beforeCall`/`afterCall` hooks.
 */
export class ImqClientPlugin extends TracingPlugin {
    public static id = IMQ_COMPONENT;
    public static component = IMQ_COMPONENT;
    public static operation = CLIENT_OPERATION;
    public static kind = 'client';
    public static type = 'messaging';

    /**
     * Starts the span for an outgoing call and injects the trace context into
     * the carrier so the handling service can continue the trace.
     *
     * @param {ImqCallContext} ctx - call being started
     */
    public start(ctx: ImqCallContext): void {
        // `false` keeps the span out of the async-local store on purpose: a
        // client span must not become the ambient parent of whatever the
        // caller does next while it waits for the response.
        const span = this.startSpan('imq.request', {
            service: ctx.serviceName,
            resource: `${ctx.serviceName}.${ctx.method}`,
            kind: ImqClientPlugin.kind,
            type: ImqClientPlugin.type,
            meta: {
                [tags.SPAN_KIND]: ImqClientPlugin.kind,
                ...(ctx.from ? { 'imq.client': ctx.from } : {}),
            },
        }, false);

        ctx.span = span;

        if (ctx.carrier) {
            this.tracer.inject(span, formats.TEXT_MAP, ctx.carrier);
        }
    }

    /**
     * Marks the span as failed. The span itself is finished by `finish()`,
     * which the instrumentation always publishes.
     *
     * @param {ImqCallContext} ctx - call that failed
     */
    public error(ctx: ImqCallContext): void {
        ctx.span?.setTag(tags.ERROR, ctx.error);
    }

    /**
     * Finishes the span of a completed call.
     *
     * @param {ImqCallContext} ctx - call that completed
     */
    public finish(ctx: ImqCallContext): void {
        ctx.span?.finish();
    }
}

export default ImqClientPlugin;
