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
import * as net from 'net';
import {
    AnyFunction,
    DDPatchTarget,
    DDRePatchImplementation,
    DDWrappedMethod,
    toSkip,
} from './index';

export const targets: DDPatchTarget[] = [{
    object: net,
    methodNames: ['get', 'request'],
}];

function checkPatch(
    target: any,
    method: DDWrappedMethod & AnyFunction,
    original: AnyFunction,
): AnyFunction {
    return function(...args: any[]) {
        let [port, host] = args;

        if (Object.prototype.toString.call(port) === '[object Object]') {
            // options passed
            host = port.host;
        }

        if (host && toSkip(host)) {
            return original.apply(this, args);
        }

        return method.apply(this, args);
    };
}

export const patcher: DDRePatchImplementation = function(
    target: any,
    methodName: string,
    method: DDWrappedMethod & AnyFunction,
    original: AnyFunction,
): AnyFunction {
    return checkPatch(target, method, original);
};
