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
import * as dns from 'dns';
import {
    AnyFunction,
    DDPatchTarget,
    DDRePatchImplementation,
    DDWrappedMethod, toSkip,
} from './index';

export const targets: DDPatchTarget[] = [{
    object: dns,
    methodNames: ['lookup', 'lookupService', 'resolve', 'reverse'],
}, ...(dns.Resolver ? [{
    object: dns.Resolver.prototype,
    methodNames: ['resolve', 'reverse'],
}] : [])];

function checkPatch(
    target: any,
    method: DDWrappedMethod & AnyFunction,
    original: AnyFunction,
): AnyFunction {
    return function(...args: any[]) {
        if (toSkip(args[0])) {
            return original.apply(target, args);
        }

        return method.apply(target, args);
    };
}

export const patcher: DDRePatchImplementation = function(
    target: any,
    methodName: string,
    method: DDWrappedMethod & AnyFunction,
    original: AnyFunction,
): AnyFunction {
    switch (methodName) {
        case 'lookup':
        case 'lookupService':
        case 'resolve':
        case 'reverse':
            return checkPatch(target, method, original);
        default:
            return method as AnyFunction;
    }
};
