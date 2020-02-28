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
import * as http from 'http';
import * as https from 'https';

export type AnyFunction = (...args: any[]) => any;
export interface DDWrappedMethod {
    __wrapped: boolean;
    __original: AnyFunction;
    __unwrap: AnyFunction;
}

const DD_TRACE_AGENT_HOSTNAME = process.env.DD_TRACE_AGENT_HOSTNAME + '';
const DISABLE_DD_SELF_TRACES = +(process.env.DISABLE_DD_SELF_TRACES || 0) || 0;
const libs: any[] = [http, https];
const methodNames = ['get', 'request'];
const RX_DD_HOST = /datadoghq\.com/;
const RX_DD_AGENT_HOST = new RegExp(
    DD_TRACE_AGENT_HOSTNAME.replace(/\./, '\\.'),
);

export function toSkip(hostOrUrl: string): boolean {
    return RX_DD_HOST.test(hostOrUrl) || RX_DD_AGENT_HOST.test(hostOrUrl);
}

export function fixTraces() {
    if (!DISABLE_DD_SELF_TRACES) {
        return ;
    }

    for (const lib of libs) {
        for (const methodName of methodNames) {
            const method: DDWrappedMethod & AnyFunction = lib[methodName];

            if (!method || !method.__wrapped) {
                continue;
            }

            const original: AnyFunction = method.__original || method;

            lib[methodName] = function (...args: any[]) {
                let [url, options] = args;

                if (typeof url !== 'string') {
                    options = url;
                    url = options.hostname || options.host;
                }

                if (toSkip(url)) {
                    return original.apply(this, args);
                }

                return method.apply(this, args);
            };

            lib[methodName].__wrapped = true;
            lib[methodName].__original = original;
            lib[methodName].__unwrap = method.__unwrap;
        }
    }
}
