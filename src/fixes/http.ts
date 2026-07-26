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
import * as http from 'node:http';
import * as https from 'node:https';
import {
    AnyFunction,
    DDPatchTarget,
    DDRePatchImplementation,
    DDWrappedMethod,
    toSkip,
} from './index.js';

export const targets: DDPatchTarget[] = [{
    object: http,
    methodNames: ['get', 'request'],
}, {
    object: https,
    methodNames: ['get', 'request'],
}];

function checkPatch(
    target: any,
    method: DDWrappedMethod & AnyFunction,
    original: AnyFunction,
): AnyFunction {
    return function(this: any, ...args: any[]) {
        let [url] = args;

        if (typeof url !== 'string') {
            const options = url;

            url = options.hostname || options.host;
        }

        if (toSkip(url)) {
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
