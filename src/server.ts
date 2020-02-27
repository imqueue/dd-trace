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
import {
    IMQService,
    IMQRPCRequest,
    IMQBeforeCall,
    IMQAfterCall,
    IMQServiceOptions,
} from '@imqueue/rpc';
import tracer, { Span, Tracer } from 'dd-trace';
import * as tags from 'dd-trace/ext/tags';
import * as formats from 'dd-trace/ext/formats';

interface BeforeCall extends IMQBeforeCall<IMQService> {
    __datadog_patched?: boolean;
}

interface AfterCall extends IMQAfterCall<IMQService> {
    __datadog_patched?: boolean;
}

interface ServiceOptions extends IMQServiceOptions {
    afterCall: AfterCall;
    beforeCall: BeforeCall;
}

type ServiceModule = {
    DEFAULT_IMQ_SERVICE_OPTIONS: ServiceOptions;
} | any;

/**
 * Before call hook definition for @imqueue service
 *
 * @param {IMQRPCRequest} req - imq request
 * @return Promise<void>
 */
const beforeCall: BeforeCall = async function(
    this: IMQService,
    req: IMQRPCRequest,
): Promise<void> {
    (req as any).toJSON = () => {
        const copy = Object.assign({}, req);
        delete copy.span;
        return copy;
    };

    const clientSpanMeta = (req.metadata || { clientSpan: null }).clientSpan;
    const redisSpan = getRedisSpan();

    let childOf = clientSpanMeta
        ? tracer.extract(formats.TEXT_MAP, clientSpanMeta)
        : redisSpan;

    // noinspection TypeScriptUnresolvedVariable
    if (
        redisSpan && childOf &&
        (childOf as any)._spanId &&
        redisSpan !== childOf
    ) {
        // noinspection TypeScriptUnresolvedVariable
        (redisSpan as any)._spanContext._parentId = (childOf as any)._spanId;
        // noinspection TypeScriptUnresolvedVariable
        (redisSpan as any)._spanContext._traceId = (childOf as any)._traceId;

        try {
            redisSpan.finish();
            childOf = redisSpan;
        } catch (err) { /* ignore */ }
    }

    (req as any).span = tracer.startSpan('imq.response', Object.assign({
        tags: {
            [tags.SPAN_KIND]: 'server',
            'resource.name': `${this.name}.${req.method}`,
            'service.name': this.name,
            'imq.client': req.from,
            'component': 'imq',
        },
    }, childOf ? { childOf } : {}));
};

function getRedisSpan() {
    const spans = (tracer.scope() as any)._spans;
    const keys = Object.keys(spans).filter(key => spans[key]);

    let redisSpan: Span | undefined;

    for (let i = keys.length - 1; i >= 0; i--) {
        const span: any = spans[keys[i]];

        // noinspection TypeScriptUnresolvedVariable
        if (span._spanContext._name === 'redis.command') {
            redisSpan = span as Span;
        }
    }

    return redisSpan;
}

/**
 * After call hook definition for @imqueue service
 *
 * @param {IMQRPCRequest} req - imq request
 * @return {Promise<void>}
 */
const afterCall: AfterCall = async function(
    this: IMQService,
    req: IMQRPCRequest,
): Promise<void> {
    const span = (req as any).span;

    span && span.finish();
};

const server = [{
    name: '@imqueue/rpc',
    versions: ['>=1.10'],
    file: 'src/IMQRPCOptions.js',
    patch(pkg: ServiceModule, tracer: Tracer, config: any) {
        if (config.client === false) {
            return ;
        }

        beforeCall.__datadog_patched = true;
        afterCall.__datadog_patched = true;

        // noinspection JSUnusedGlobalSymbols
        Object.assign(
            pkg.DEFAULT_IMQ_SERVICE_OPTIONS,
            { beforeCall, afterCall },
        );

        return pkg;
    },
    unpatch(pkg: ServiceModule) {
        const { beforeCall, afterCall } = pkg.DEFAULT_IMQ_SERVICE_OPTIONS;

        if (beforeCall && beforeCall.__datadog_patched) {
            delete pkg.DEFAULT_IMQ_SERVICE_OPTIONS.beforeCall;
        }

        if (afterCall && afterCall.__datadog_patched) {
            delete pkg.DEFAULT_IMQ_SERVICE_OPTIONS.afterCall;
        }

        return pkg;
    },
}];

export default server;
