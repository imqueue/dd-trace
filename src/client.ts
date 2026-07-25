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
