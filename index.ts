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
import redis from './src/redis';
const plugins = require('dd-trace/packages/dd-trace/src/plugins');

import plugin from './src';
import tracer, { Span } from 'dd-trace';
import * as Tags from 'dd-trace/ext/tags';
import * as path from 'path';

// Add imq plugin for dd-trace to process
// and override redis plugin
Object.assign(plugins, {
    'redis': redis,
    'imq': plugin,
});

const nativeInit = tracer.init;

tracer.init = function(...args: any[]): any {
    nativeInit.apply(this, args);
    require('./src/fixes').fixDDTraces();
};

// noinspection JSUnusedGlobalSymbols
export default tracer;
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

    const scope = tracer.scope();
    const spans = (tracer.scope() as any)._spans;
    const keys = Object.keys(spans).filter(key => spans[key]);
    const childOf = scope.active() || spans[keys[keys.length - 1]];

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
    pkgName = require(`${path.resolve('.')}${path.sep}package.json`).name;
} catch (err) { /* ignore */ }

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

        descriptor.value = function<T>(...args: any[]) {
            const className = this.constructor.name;
            const tags = Object.assign({
                [Tags.SPAN_KIND]: opts.kind,
                'resource.name': `${className}.${String(methodName)}`,
                ...(pkgName ? { 'package.name': pkgName } : {}),
                'component': 'imq',
            }, opts.tags || {});
            const scope = tracer.scope();
            const spans = (tracer.scope() as any)._spans;
            const keys = Object.keys(spans).filter(key => spans[key]);
            const childOf = scope.active() || spans[keys[keys.length - 1]];
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
