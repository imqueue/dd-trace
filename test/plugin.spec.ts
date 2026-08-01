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
import type { IMQRPCRequest } from '@imqueue/rpc';
import * as assert from 'node:assert/strict';
import {
    CALL_CONTEXT,
    clientChannels,
    clientHooks,
    ImqCallContext,
    ImqClientPlugin,
    ImqPlugin,
    ImqServerPlugin,
    installHooks,
    REGISTRY_KEY,
    serverChannels,
    serverHooks,
} from '../src/index.js';
import { pluginRegistry } from '../src/internals.js';

/**
 * Importing the package registers the plugin and installs the hooks; calling
 * `init()` is what makes the tracer instantiate the plugin, exactly as an
 * application would do it.
 */
const tracer = (await import('../index.js')).default;

tracer.init({ service: 'imq-datadog-test', startupLogs: false } as any);

/**
 * Builds a request as @imqueue/rpc would hand it to the hooks.
 *
 * @param {Partial<IMQRPCRequest>} [overrides] - fields to override
 * @return {IMQRPCRequest}
 */
function request(overrides: Partial<IMQRPCRequest> = {}): IMQRPCRequest {
    return {
        from: 'CallerService-12345',
        method: 'update',
        args: [],
        ...overrides,
    } as IMQRPCRequest;
}

/**
 * Reads back the context the hooks attached to a request.
 *
 * @param {IMQRPCRequest} req - request to read from
 * @return {ImqCallContext}
 */
function contextOf(req: IMQRPCRequest): ImqCallContext {
    return (req as any)[CALL_CONTEXT];
}

describe('@imqueue/datadog', () => {
    describe('plugin registration', () => {
        it('should register the composite plugin under the traced package ' +
            'name', () => {
            assert.equal(pluginRegistry[REGISTRY_KEY], ImqPlugin);
        });

        it('should expose an id the tracer can be configured with', () => {
            assert.equal(ImqPlugin.id, 'imq');
            // dd-trace ignores registry entries that are not constructors
            assert.equal(typeof ImqPlugin, 'function');
        });

        it('should group a client and a server half', () => {
            assert.deepEqual(Object.keys(ImqPlugin.plugins), [
                'client',
                'server',
            ]);
            assert.equal(ImqPlugin.plugins.client, ImqClientPlugin);
            assert.equal(ImqPlugin.plugins.server, ImqServerPlugin);
        });

        it('should subscribe both halves to their channels once enabled',
            () => {
                // the whole integration is inert without these
                assert.equal(clientChannels.start.hasSubscribers, true);
                assert.equal(clientChannels.finish.hasSubscribers, true);
                assert.equal(serverChannels.start.hasSubscribers, true);
                assert.equal(serverChannels.finish.hasSubscribers, true);
            },
        );
    });

    describe('client hooks', () => {
        const client = { serviceName: 'UserService' };

        it('should start a span named after the called method', async () => {
            const req = request();

            await clientHooks.beforeCall.call(client, req);

            const span = contextOf(req).span;

            assert.equal(span.context()._name, 'imq.request');
            assert.equal(
                span.context()._tags['resource.name'],
                'UserService.update',
            );
            assert.equal(span.context()._tags['span.kind'], 'client');
            assert.equal(span.context()._tags.component, 'imq');
            assert.equal(
                span.context()._tags['imq.client'],
                'CallerService-12345',
            );

            await clientHooks.afterCall.call(client, req);
        });

        it('should propagate the trace context through request metadata',
            async () => {
                const req = request();

                await clientHooks.beforeCall.call(client, req);

                const carrier: any = (req.metadata as any)?.clientSpan;

                assert.equal(typeof carrier, 'object');
                assert.equal(
                    typeof carrier['x-datadog-trace-id'],
                    'string',
                    'the carrier must hold the injected trace context',
                );

                await clientHooks.afterCall.call(client, req);
            },
        );

        it('should keep the span out of the serialized request', async () => {
            const req = request();

            await clientHooks.beforeCall.call(client, req);

            const serialized = JSON.parse(JSON.stringify(req));

            assert.equal(serialized.span, undefined);
            assert.equal(
                Object.keys(serialized).includes('span'),
                false,
                'a span must never reach the queue',
            );

            await clientHooks.afterCall.call(client, req);
        });

        it('should finish the span and drop the context on afterCall',
            async () => {
                const req = request();

                await clientHooks.beforeCall.call(client, req);

                const span = contextOf(req).span;

                assert.equal(span._duration, undefined);

                await clientHooks.afterCall.call(client, req);

                assert.notEqual(
                    span._duration,
                    undefined,
                    'the span must be finished',
                );
                assert.equal(contextOf(req), undefined);
            },
        );

        it('should mark the span as failed when the response carries an error',
            async () => {
                const req = request();

                await clientHooks.beforeCall.call(client, req);

                const span = contextOf(req).span;
                const error = { message: 'boom', code: 'IMQ_ERROR' };

                await clientHooks.afterCall.call(client, req, {
                    error,
                } as any);

                assert.equal(span.context()._tags.error, error);
            },
        );

        it('should tolerate being called without a request', async () => {
            await assert.doesNotReject(
                () => clientHooks.beforeCall.call(client),
            );
            await assert.doesNotReject(
                () => clientHooks.afterCall.call(client),
            );
        });

        it('should tolerate an afterCall that has no matching beforeCall',
            async () => {
                await assert.doesNotReject(
                    () => clientHooks.afterCall.call(client, request()),
                );
            },
        );
    });

    describe('server hooks', () => {
        const service = { name: 'UserService' };

        it('should start a span for an incoming call', async () => {
            const req = request();

            await serverHooks.beforeCall.call(service, req);

            const span = contextOf(req).span;

            assert.equal(span.context()._name, 'imq.response');
            assert.equal(
                span.context()._tags['resource.name'],
                'UserService.update',
            );
            assert.equal(span.context()._tags['span.kind'], 'server');

            await serverHooks.afterCall.call(service, req);
        });

        it('should continue the trace the caller started', async () => {
            // the client half writes the carrier the server half reads
            const clientReq = request();

            await clientHooks.beforeCall.call(
                { serviceName: 'UserService' },
                clientReq,
            );

            const clientSpan = contextOf(clientReq).span;
            const serverReq = request({ metadata: clientReq.metadata });

            await serverHooks.beforeCall.call(service, serverReq);

            const serverSpan = contextOf(serverReq).span;

            assert.equal(
                serverSpan.context().toTraceId(),
                clientSpan.context().toTraceId(),
                'client and server spans must share one trace',
            );
            assert.equal(
                serverSpan.context()._parentId.toString(10),
                clientSpan.context().toSpanId(),
                'the server span must be a child of the client span',
            );

            await serverHooks.afterCall.call(service, serverReq);
            await clientHooks.afterCall.call(
                { serviceName: 'UserService' },
                clientReq,
            );
        });

        it('should start a fresh trace when no context was propagated',
            async () => {
                const req = request();

                await serverHooks.beforeCall.call(service, req);

                const span = contextOf(req).span;

                assert.equal(span.context()._parentId, null);

                await serverHooks.afterCall.call(service, req);
            },
        );

        it('should not add a carrier to an incoming request', async () => {
            const req = request();

            await serverHooks.beforeCall.call(service, req);

            assert.equal((req.metadata as any)?.clientSpan, undefined);

            await serverHooks.afterCall.call(service, req);
        });
    });

    describe('installHooks()', () => {
        it('should install both hooks on a bare options object', () => {
            const options: any = {};

            assert.equal(installHooks(options, clientHooks), true);
            assert.equal(typeof options.beforeCall, 'function');
            assert.equal(typeof options.afterCall, 'function');
        });

        it('should be idempotent', () => {
            const options: any = {};

            assert.equal(installHooks(options, clientHooks), true);

            const installed = options.beforeCall;

            assert.equal(installHooks(options, clientHooks), false);
            assert.equal(options.beforeCall, installed);
        });

        it('should keep hooks the application had configured itself',
            async () => {
                const calls: string[] = [];
                const options: any = {
                    async beforeCall() {
                        calls.push('application');
                    },
                };

                installHooks(options, {
                    async beforeCall() {
                        calls.push('tracing');
                    },
                    async afterCall() { /* noop */ },
                });

                await options.beforeCall();

                assert.deepEqual(calls, ['tracing', 'application']);
            },
        );

        it('should not mark the marker property as enumerable', () => {
            const options: any = {};

            installHooks(options, clientHooks);

            assert.deepEqual(Object.keys(options), ['beforeCall', 'afterCall']);
        });

        it('should refuse a missing options object', () => {
            assert.equal(installHooks(undefined, clientHooks), false);
        });
    });

    describe('instrument()', () => {
        it('should have hooked the @imqueue/rpc default options', async () => {
            const {
                DEFAULT_IMQ_CLIENT_OPTIONS,
                DEFAULT_IMQ_SERVICE_OPTIONS,
            } = await import('@imqueue/rpc');

            assert.equal(
                typeof DEFAULT_IMQ_CLIENT_OPTIONS.beforeCall,
                'function',
            );
            assert.equal(
                typeof DEFAULT_IMQ_CLIENT_OPTIONS.afterCall,
                'function',
            );
            assert.equal(
                typeof DEFAULT_IMQ_SERVICE_OPTIONS.beforeCall,
                'function',
            );
            assert.equal(
                typeof DEFAULT_IMQ_SERVICE_OPTIONS.afterCall,
                'function',
            );
        });

        it('should trace a call made through the default client options',
            async () => {
                const { DEFAULT_IMQ_CLIENT_OPTIONS } =
                    await import('@imqueue/rpc');
                const req = request({ method: 'get' });

                await DEFAULT_IMQ_CLIENT_OPTIONS.beforeCall?.call(
                    { serviceName: 'UserService' } as any,
                    req,
                );

                assert.equal(
                    contextOf(req).span.context()._tags['resource.name'],
                    'UserService.get',
                );

                await DEFAULT_IMQ_CLIENT_OPTIONS.afterCall?.call(
                    { serviceName: 'UserService' } as any,
                    req,
                );
            },
        );
    });
});
