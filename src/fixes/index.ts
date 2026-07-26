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
export const DD_TRACE_AGENT_HOSTNAME: string =
    process.env.DD_TRACE_AGENT_HOSTNAME || '';
export const DISABLE_DD_SELF_TRACES: number =
    +(process.env.DISABLE_DD_SELF_TRACES || 0) || 0;
const RX_DD_HOST = /datadoghq\.com/;
// Every regexp metacharacter has to be escaped, not just the first dot, or a
// hostname like `dd.agent.local` would also match `ddXagentXlocal`. When no
// agent hostname is configured there is nothing to match against at all —
// matching the literal string "undefined" would skip any URL containing it.
const RX_DD_AGENT_HOST: RegExp | null = DD_TRACE_AGENT_HOSTNAME
    ? new RegExp(DD_TRACE_AGENT_HOSTNAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    : null;

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
        method: DDWrappedMethod & AnyFunction,
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
    if (!hostOrUrl || typeof hostOrUrl !== 'string') {
        return false;
    }

    return RX_DD_HOST.test(hostOrUrl) ||
        (!!RX_DD_AGENT_HOST && RX_DD_AGENT_HOST.test(hostOrUrl));
}

import { targets as dnsTargets, patcher as dnsPatcher } from './dns.js';
import { targets as netTargets, patcher as netPatcher } from './net.js';
import { targets as httpTargets, patcher as httpPatcher } from './http.js';

export function fixDDTraces() {
    fixTraces(dnsTargets, dnsPatcher);
    fixTraces(httpTargets, httpPatcher);
    fixTraces(netTargets, netPatcher);
}
