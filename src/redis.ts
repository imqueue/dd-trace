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
const tx: any = require('dd-trace/packages/dd-trace/src/plugins/util/redis');

function createWrapInternalSendCommand(tracer: any, config: any) {
    return function wrapInternalSendCommand(internalSendCommand: any) {
        return function internalSendCommandWithTrace(options: any) {
            const scope = tracer.scope();
            const span = startSpan(
                tracer,
                config,
                this,
                options.command,
                options.args,
            );

            options.callback = scope.bind(tx.wrap(span, options.callback));

            return scope.bind(internalSendCommand, span).call(this, options);
        }
    }
}

function createWrapSendCommand(tracer: any, config: any) {
    return function wrapSendCommand(sendCommand: any) {
        return function sendCommandWithTrace(
            command: any,
            args: any,
            callback: any,
        ) {
            const scope = tracer.scope();
            const span = startSpan(tracer, config, this, command, args);

            if (typeof callback === 'function') {
                callback = scope.bind(tx.wrap(span, callback));
            } else if (
                Array.isArray(args) &&
                typeof args[args.length - 1] === 'function'
            ) {
                args[args.length - 1] = scope.bind(
                    tx.wrap(span, args[args.length - 1]),
                );
            } else {
                callback = tx.wrap(span)
            }

            return scope.bind(sendCommand, span)
                .call(this, command, args, callback);
        }
    }
}

function startSpan(
    tracer: any,
    config: any,
    client: any,
    command: any,
    args: any,
) {
    // noinspection TypeScriptUnresolvedVariable
    const db = client.selected_db;
    // noinspection TypeScriptUnresolvedVariable
    const connectionOptions = client.connection_options ||
        client.connection_option ||
        client.connectionOption ||
        {};
    // noinspection TypeScriptUnresolvedFunction
    const span = tx.instrument(tracer, config, db, command, args);

    // noinspection TypeScriptUnresolvedVariable
    if (client.__imq) {
        span.setTag('service.name', 'imq-broker-redis');
    }

    // noinspection TypeScriptValidateJSTypes
    tx.setHost(span, connectionOptions.host, connectionOptions.port);

    return span;
}

const redis = [{
    name: 'redis',
    versions: ['>=2.6'],
    patch(this: any, redis: any, tracer: any, config: any) {
        // noinspection TypeScriptUnresolvedVariable
        this.wrap(
            redis.RedisClient.prototype,
            'internal_send_command',
            createWrapInternalSendCommand(tracer, config) as any,
        );
    },
    unpatch(this: any, redis: any) {
        //noinspection TypeScriptUnresolvedFunction,TypeScriptUnresolvedVariable
        this.unwrap(redis.RedisClient.prototype, 'internal_send_command');
    },
}, {
    name: 'redis',
    versions: ['>=0.12 <2.6'],
    patch(this: any, redis: any, tracer: any, config: any) {
        // noinspection TypeScriptUnresolvedVariable
        this.wrap(
            redis.RedisClient.prototype,
            'send_command',
            createWrapSendCommand(tracer, config) as any
        );
    },
    unpatch(this: any, redis: any) {
        //noinspection TypeScriptUnresolvedFunction,TypeScriptUnresolvedVariable
        this.unwrap(redis.RedisClient.prototype, 'send_command');
    },
}];

export default redis;
