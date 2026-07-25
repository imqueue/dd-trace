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
import { IMQ_COMPONENT, ImqCallContext, SERVER_OPERATION } from './channels.js';
import { TracingPlugin } from './internals.js';

/**
 * Traces incoming @imqueue RPC calls.
 *
 * Subscribes to `apm:imq:response:{start,error,finish}` — the channels the
 * instrumentation in `./instrumentation` publishes from the service's
 * `beforeCall`/`afterCall` hooks.
 */
export class ImqServerPlugin extends TracingPlugin {
    public static id = IMQ_COMPONENT;
    public static component = IMQ_COMPONENT;
    public static operation = SERVER_OPERATION;
    public static kind = 'server';
    public static type = 'messaging';

    /**
     * Starts the span for an incoming call, continuing the caller's trace when
     * the request carries a propagated context.
     *
     * @param {ImqCallContext} ctx - call being handled
     */
    public start(ctx: ImqCallContext): void {
        const childOf = ctx.carrier
            ? this.tracer.extract(formats.TEXT_MAP, ctx.carrier)
            : null;

        // `childOf` is always passed, `null` included: handling an incoming
        // call starts a trace, so when the caller propagated nothing this
        // span must be a root rather than silently attach to whatever span
        // happens to be active — which, since spans are entered into the
        // async-local store below, would chain unrelated calls into one trace.
        //
        // `true` enters the span into that store, so spans created while the
        // service method runs become its children.
        const span = this.startSpan('imq.response', {
            service: ctx.serviceName,
            resource: `${ctx.serviceName}.${ctx.method}`,
            kind: ImqServerPlugin.kind,
            type: ImqServerPlugin.type,
            childOf,
            meta: {
                [tags.SPAN_KIND]: ImqServerPlugin.kind,
                ...(ctx.from ? { 'imq.client': ctx.from } : {}),
            },
        }, true);

        ctx.span = span;
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
     * Finishes the span of a handled call.
     *
     * @param {ImqCallContext} ctx - call that completed
     */
    public finish(ctx: ImqCallContext): void {
        ctx.span?.finish();
    }
}

export default ImqServerPlugin;
