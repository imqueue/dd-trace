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
