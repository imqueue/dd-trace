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
export const DD_TRACE_AGENT_HOSTNAME: string =
    process.env.DD_TRACE_AGENT_HOSTNAME + '';
export const DISABLE_DD_SELF_TRACES: number =
    +(process.env.DISABLE_DD_SELF_TRACES || 0) || 0;
const RX_DD_HOST = /datadoghq\.com/;
const RX_DD_AGENT_HOST = new RegExp(
    DD_TRACE_AGENT_HOSTNAME.replace(/\./, '\\.'),
);

export type AnyFunction = (...args: any[]) => any;
export interface DDWrappedMethod {
    __wrapped: boolean;
    __original: AnyFunction;
    __unwrap: AnyFunction;
}

export interface DDPatchTarget {
    object: any;
    methodNames: string[];
}

export interface DDRePatchImplementation {
    (
        target: any,
        methodName: string,
        method: DDWrappedMethod,
        original: AnyFunction,
    ): AnyFunction;
}

export function fixTraces(
    targets: DDPatchTarget[],
    patcher: DDRePatchImplementation,
) {
    if (!DISABLE_DD_SELF_TRACES) {
        return ;
    }

    for (const target of targets) {
        const { object, methodNames } = target;

        for (const methodName of methodNames) {
            const method: DDWrappedMethod & AnyFunction = object[methodName];

            if (!method || !method.__wrapped) {
                continue;
            }

            const original: AnyFunction = method.__original || method;

            object[methodName] = patcher(target, methodName, method, original);
            object[methodName].__wrapped = true;
            object[methodName].__original = original;
            object[methodName].__unwrap = method.__unwrap;
        }
    }
}

export function toSkip(hostOrUrl: string): boolean {
    return RX_DD_HOST.test(hostOrUrl) || RX_DD_AGENT_HOST.test(hostOrUrl);
}

import { targets as dnsTargets, patcher as dnsPatcher } from './dns';
import { targets as netTargets, patcher as netPatcher } from './net';
import { targets as httpTargets, patcher as httpPatcher } from './http';

export function fixDDTraces() {
    fixTraces(dnsTargets, dnsPatcher);
    fixTraces(httpTargets, httpPatcher);
    fixTraces(netTargets, netPatcher);
}
