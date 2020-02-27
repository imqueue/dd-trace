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
    IMQClient,
    IMQRPCRequest,
    IMQClientOptions,
    IMQAfterCall,
    IMQBeforeCall,
} from '@imqueue/rpc';
import tracer, { Tracer } from 'dd-trace';
import * as tags from 'dd-trace/ext/tags';
import * as formats from 'dd-trace/ext/formats';

interface BeforeCall extends IMQBeforeCall<IMQClient> {
    __datadog_patched?: boolean;
}

interface AfterCall extends IMQAfterCall<IMQClient> {
    __datadog_patched?: boolean;
}

interface ClientOptions extends IMQClientOptions {
    afterCall: AfterCall;
    beforeCall: BeforeCall;
}

type ClientModule = {
    DEFAULT_IMQ_CLIENT_OPTIONS: ClientOptions;
} | any;

/**
 * Before call hook definition for @imqueue client
 *
 * @param {IMQRPCRequest} req - imq request
 * @return Promise<void>
 */
const beforeCall: BeforeCall = async function(
    this: IMQClient,
    req: IMQRPCRequest
): Promise<void> {
    (req as any).toJSON = () => {
        const copy = Object.assign({}, req);
        delete copy.span;
        return copy;
    };

    const childOf = tracer.scope().active();
    const span = tracer.startSpan('imq.request', Object.assign({
        tags: {
            [tags.SPAN_KIND]: 'client',
            'resource.name': `${this.serviceName}.${req.method}`,
            'service.name': this.serviceName,
            'imq.client': req.from,
            'component': 'imq',
        },
    }, childOf ? { childOf } : {}));

    req.metadata = req.metadata || {};
    req.metadata.clientSpan = {};

    tracer.inject(span, formats.TEXT_MAP, req.metadata.clientSpan);

    (req as any).span = span;

    return new Promise(resolve => {
        try {
            tracer.scope().activate(span, resolve);
        } catch (err) {
            resolve();
        }
    });
};

/**
 * After call hook definition for @imqueue client
 *
 * @param {IMQRPCRequest} req - imq request
 * @return {Promise<void>}
 */
const afterCall: AfterCall = async function(
    this: IMQClient,
    req: IMQRPCRequest,
): Promise<void> {
    const span = (req as any).span;

    span && span.finish();
};

const client = [{
    name: '@imqueue/rpc',
    versions: ['>=1.10'],
    file: 'src/IMQRPCOptions.js',
    patch(pkg: ClientModule, tracer: Tracer, config: any) {
        if (config.client === false) {
            return ;
        }

        beforeCall.__datadog_patched = true;
        afterCall.__datadog_patched = true;

        // noinspection JSUnusedGlobalSymbols
        Object.assign(
            pkg.DEFAULT_IMQ_CLIENT_OPTIONS,
            { beforeCall, afterCall },
        );

        return pkg;
    },
    unpatch(pkg: ClientModule) {
        const { beforeCall, afterCall } = pkg.DEFAULT_IMQ_CLIENT_OPTIONS;

        if (beforeCall && beforeCall.__datadog_patched) {
            delete pkg.DEFAULT_IMQ_CLIENT_OPTIONS.beforeCall;
        }

        if (afterCall && afterCall.__datadog_patched) {
            delete pkg.DEFAULT_IMQ_CLIENT_OPTIONS.afterCall;
        }

        return pkg;
    },
}];

export default client;
