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
/**
 * Datadog APM tracing for `@imqueue/rpc` — distributed traces across IMQ
 * service calls, with no changes to service or client code.
 *
 * Import this package instead of `dd-trace` and call `init()` as usual. Every
 * RPC then produces an `imq.request` span on the calling side and an
 * `imq.response` span on the handling side, linked into one trace:
 *
 * ```typescript
 * import tracer from '@imqueue/dd-trace';
 *
 * tracer.init();
 *
 * export default tracer;
 * ```
 *
 * @remarks
 * The default export IS the `dd-trace` tracer, and this package re-exports
 * everything `dd-trace` does, so it is a drop-in replacement — every `dd-trace`
 * API and option keeps working. What it adds is an `imq` integration registered
 * with the tracer, plus the manual tools below.
 *
 * Both halves of the integration can be configured like any other `dd-trace`
 * plugin, together or separately:
 *
 * ```typescript
 * tracer.use('imq', { client: false });     // trace incoming calls only
 * tracer.use('imq', { service: 'my-api' }); // report both halves as `my-api`
 * ```
 *
 * Ordering matters in one direction only. The hooks are installed at IMPORT
 * time, before `init()`, because `@imqueue/rpc` reads its default options when
 * a client or service is constructed — so any client or service built after the
 * import is traced. `init()` is what enables the integration and starts
 * reporting.
 *
 * An ES module, as `@imqueue/rpc` is from v3 on: import it, do not `require`
 * it. Needs `@imqueue/rpc` 3.x and `dd-trace` 6.x.
 *
 * For manual spans inside application code there are {@link trace} /
 * {@link traceEnd} and the {@link traced} method decorator. Setting
 * `DISABLE_DD_SELF_TRACES=1` stops the agent tracing its own HTTP calls to
 * Datadog while leaving other outbound requests traced.
 *
 * @packageDocumentation
 */
import tracer, { Span, TracerOptions } from 'dd-trace';
import Tags from 'dd-trace/ext/tags.js';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { enablePlugin, instrument, registerPlugin } from './src/index.js';
import { fixDDTraces } from './src/fixes/index.js';

export * from './src/index.js';

// The plugin has to be in the tracer's registry before `init()` announces it.
registerPlugin();

const nativeInit = tracer.init;

/**
 * `init()` is wrapped so that everything this package adds on top of dd-trace
 * comes up with the tracer itself, keeping the documented two-line setup:
 * enabling the `imq` integration, which the tracer ignores until it has a
 * configuration, and applying the self-trace fixes.
 */
tracer.init = function(options?: TracerOptions): typeof tracer {
    const result = nativeInit.call(this, options);

    enablePlugin();
    fixDDTraces();

    return result;
};

// Installing the hooks does not depend on the tracer being initialized: the
// channels they publish on have no subscribers until the plugin is enabled, and
// @imqueue/rpc reads these options when a client or service is
// constructed. Done at import time so it is in place whenever `init()` runs.
await instrument();

// noinspection JSUnusedGlobalSymbols
export default tracer;
// @ts-expect-error - re-exporting a CommonJS module's named exports
export * from 'dd-trace';

/**
 * Datadog span tags as a flat string map.
 *
 * @remarks
 * Values are `string` only. Numbers belong in metrics rather than tags, and a
 * high-cardinality value (a user id, a request id) makes spans expensive to
 * index — prefer a bounded set of values.
 */
export interface TraceTags {
    [name: string]: string;
}

const traces: { [name: string]: Span } = {};

// noinspection JSUnusedGlobalSymbols
/**
 * Starts a named span for tracing a block of code that no decorator can wrap,
 * to be closed later by {@link traceEnd} with the same name.
 *
 * @remarks
 * The span is registered under `name` in a module-level map, which is what lets
 * {@link traceEnd} close it from an unrelated call site. Two consequences
 * follow:
 *
 * - A name may have only ONE span open at a time. Starting a second under a
 * live name throws rather than replacing the first, which would leak it.
 * - A span never closed is never reported. Use `try`/`finally` wherever the
 * block can throw, or reach for {@link traced} instead.
 *
 * Unlike the OpenTelemetry sibling of this package, the span DOES attach to the
 * currently active span when there is one, so a manual span nests inside the
 * RPC span that surrounds it rather than starting a separate trace.
 *
 * @example
 * ```typescript
 * import { trace, traceEnd } from '@imqueue/dd-trace';
 *
 * trace('import-batch', { 'batch.source': 'nightly' });
 *
 * try {
 *     await importRows(rows);
 * } finally {
 *     traceEnd('import-batch');
 * }
 * ```
 *
 * @param name - span name, and the key {@link traceEnd} will close it by
 * @param tags - tags to set on the span at creation
 * @throws TypeError if a span under this name is already open
 */
export function trace(name: string, tags?: TraceTags) {
    if (traces[name]) {
        throw new TypeError(
            `Trace with name ${name} has been already started!`,
        );
    }

    const childOf = tracer.scope().active();

    traces[name] = tracer.startSpan(name, {
        ...(childOf ? { childOf } : {}),
        ...(tags ? { tags } : {}),
    });
}

// noinspection JSUnusedGlobalSymbols
/**
 * Finishes the span {@link trace} opened under this name and releases it, so
 * the name can be reused.
 *
 * @remarks
 * An unknown or already-finished name is a silent no-op, not an error — safe to
 * call from a `finally` block without checking whether the span was started.
 * The flip side is that a misspelled name fails silently and leaves the real
 * span open and unreported.
 *
 * @param name - the name the span was started under
 */
export function traceEnd(name: string) {
    if (traces[name]) {
        traces[name].finish();
        delete traces[name];
    }
}

/**
 * Which side of a call a span describes. Reported as Datadog's `span.kind` tag.
 */
export enum TraceKind {
    // noinspection JSUnusedGlobalSymbols
    /** Work this process performs on someone else's behalf — the default. */
    SERVER = 'server',

    /** An outbound call this process makes and waits on. */
    CLIENT = 'client',
}

/**
 * Options for the {@link traced} method decorator. Every field is optional at
 * the call site — `traced()` takes a `Partial` of this and fills the rest in.
 */
export interface TracedOptions {
    /**
     * Whether the decorated method serves work or calls out for it. Reported as
     * the `span.kind` tag. Defaults to {@link TraceKind.SERVER}.
     */
    kind: TraceKind;

    /**
     * Extra tags for every span the decorator creates. Applied after the
     * automatic ones, so a key used here overrides the automatic value —
     * including `resource.name`, to name the operation yourself.
     */
    tags?: TraceTags;
}

const DEFAULT_TRACED_OPTIONS: TracedOptions = {
    kind: TraceKind.SERVER,
};

let pkgName = '';

try {
    const require = createRequire(import.meta.url);

    pkgName = require(`${path.resolve('.')}${path.sep}package.json`).name;
} catch { /* the working directory may have no package.json */ }

// noinspection JSUnusedGlobalSymbols
/**
 * Builds a method decorator that wraps each call to the decorated method in its
 * own span, finishing it when the method returns — or when the promise it
 * returned settles.
 *
 * @remarks
 * Use this for work worth seeing in a trace that is not itself an RPC, so the
 * automatic `imq.request`/`imq.response` spans do not already cover it: a cache
 * rebuild, a report query, a third-party call.
 *
 * Async methods are handled: a returned thenable keeps the span open until it
 * settles, so the span duration reflects the real work rather than the time to
 * return a promise. A rejection, or a synchronous throw, tags the span with the
 * error, finishes it, and re-throws — the decorator never swallows a failure.
 *
 * Every span it creates is named `method.call`; the decorated method is
 * identified by the `resource.name` tag (`ClassName.methodName`), with the host
 * package name reported separately as `package.name`. The span attaches to the
 * active span when there is one, so a traced method called while handling an
 * RPC nests inside that call's span.
 *
 * @example
 * ```typescript
 * import { traced, TraceKind } from '@imqueue/dd-trace';
 *
 * class Reports {
 *     @traced()
 *     public async rebuild(day: string): Promise<void> {
 *         // span stays open until this promise settles
 *     }
 *
 *     @traced({ kind: TraceKind.CLIENT, tags: { 'peer.service': 'billing' } })
 *     public async fetchInvoices(userId: string): Promise<Invoice[]> {
 *         return this.http.get(`/invoices/${ userId }`);
 *     }
 * }
 * ```
 *
 * @param options - span kind and extra tags. `kind` defaults to
 *         {@link TraceKind.SERVER}; tags given here are applied last and
 *         override the automatic ones.
 * @returns a method decorator to apply to the methods you want traced
 */
export function traced(options?: Partial<TracedOptions>) {
    return (
        target: any,
        methodName: string | symbol,
        descriptor: TypedPropertyDescriptor<(...args: any[]) => any>,
    ) => {
        const original = descriptor.value;
        const opts: TracedOptions = Object.assign(
            {}, DEFAULT_TRACED_OPTIONS, options || {},
        );

        descriptor.value = function(this: any, ...args: any[]) {
            const className = this.constructor.name;
            const tags = Object.assign({
                [Tags.SPAN_KIND]: opts.kind,
                'resource.name': `${className}.${String(methodName)}`,
                ...(pkgName ? { 'package.name': pkgName } : {}),
                'component': 'imq',
            }, opts.tags || {});
            const childOf = tracer.scope().active();
            const span = tracer.startSpan('method.call', {
                tags, ...(childOf ? { childOf } : {}),
            });

            try {
                const result: any = original && original.apply(this, args);

                if (result && result.then) {
                    // noinspection CommaExpressionJS
                    return result.then((res: any) => (span.finish(), res))
                        .catch((err: any) => handleError(span, err));
                }

                span.finish();

                return result;
            } catch (err) {
                handleError(span, err);
            }
        };
    };
}

/**
 * Tags a span with an error, finishes it, and re-throws the original error
 * unchanged — so tracing never alters what the caller sees.
 *
 * @param span - the span to tag and finish
 * @param err - the error to record and re-throw
 * @throws the `err` it was given, always
 */
function handleError(span: Span, err: any) {
    span.setTag(Tags.ERROR, err);
    span.finish();

    throw err;
}
