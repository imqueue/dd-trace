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

export interface TraceTags {
    [name: string]: string;
}

const traces: { [name: string]: Span } = {};

// noinspection JSUnusedGlobalSymbols
/**
 * Short-hand for making in-code traces. Starts datadog trace span with the
 * given name, and assigns it given tags (if passed).
 *
 * @example
 * ```typescript
 * import { trace, traceEnd } from '@imqueue/dd-trace';
 *
 * trace('my-trace');
 * // ... do some work
 * traceEnd('my-trace');
 * ```
 *
 * @param {string} name - trace name (datadog span name
 * @param {TraceTags} [tags] - datadog trace span tags, if passed
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
 * Short-hand for finishing datadog trace span.
 *
 * @param {string} name
 */
export function traceEnd(name: string) {
    if (traces[name]) {
        traces[name].finish();
        delete traces[name];
    }
}

export enum TraceKind {
    // noinspection JSUnusedGlobalSymbols
    SERVER = 'server',
    CLIENT = 'client',
}

export interface TracedOptions {
    kind: TraceKind;
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
 * Decorator factory, which return decorator function allowing to add tracing to
 * decorated method calls.
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
 * Handles error gracefully, finishing tracing span before throwing
 *
 * @param {Span} span
 * @param {any} err
 * @throws {any}
 */
function handleError(span: Span, err: any) {
    span.setTag(Tags.ERROR, err);
    span.finish();

    throw err;
}
