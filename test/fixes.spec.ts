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
import * as assert from 'node:assert/strict';
import * as http from 'node:http';

type FixesModule = typeof import('../src/fixes/index.js');

const FIXES_URL = new URL('../src/fixes/index.js', import.meta.url).href;

let generation = 0;

/**
 * `src/fixes` reads its configuration from the environment when it is
 * evaluated, so every case needs a freshly evaluated copy. ES modules are
 * cached by URL and there is no way to evict them, so a unique query string is
 * used to force a new instance.
 *
 * @param {Record<string, string | undefined>} env - variables to evaluate the
 *        module under; the previous values are restored afterwards
 * @return {Promise<FixesModule>}
 */
async function loadFixes(
    env: Record<string, string | undefined>,
): Promise<FixesModule> {
    const saved: Record<string, string | undefined> = {};

    for (const key of Object.keys(env)) {
        saved[key] = process.env[key];

        if (env[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = env[key];
        }
    }

    try {
        return await import(`${ FIXES_URL }?generation=${ ++generation }`);
    } finally {
        for (const key of Object.keys(saved)) {
            if (saved[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = saved[key];
            }
        }
    }
}

describe('src/fixes', () => {
    describe('toSkip()', () => {
        it('should skip Datadog intake hosts', async () => {
            const { toSkip } = await loadFixes({
                DD_TRACE_AGENT_HOSTNAME: undefined,
            });

            assert.equal(
                toSkip('https://trace.agent.datadoghq.com/v0.4'),
                true,
            );
            assert.equal(toSkip('app.datadoghq.com'), true);
        });

        it('should skip the configured agent hostname', async () => {
            const { toSkip } = await loadFixes({
                DD_TRACE_AGENT_HOSTNAME: 'dd-agent.internal',
            });

            assert.equal(toSkip('http://dd-agent.internal:8126/v0.4'), true);
        });

        it('should not skip unrelated hosts', async () => {
            const { toSkip } = await loadFixes({
                DD_TRACE_AGENT_HOSTNAME: 'dd-agent.internal',
            });

            assert.equal(toSkip('https://api.example.com/users'), false);
            assert.equal(toSkip('localhost'), false);
        });

        it('should escape every dot of the agent hostname, not just the ' +
            'first', async () => {
            const { toSkip } = await loadFixes({
                DD_TRACE_AGENT_HOSTNAME: 'dd.agent.local',
            });

            assert.equal(toSkip('dd.agent.local'), true);
            // these would match if only the first dot were escaped
            assert.equal(toSkip('ddXagentXlocal'), false);
            assert.equal(toSkip('dd.agentXlocal'), false);
        });

        it('should match nothing by host when no agent hostname is set',
            async () => {
                const { toSkip } = await loadFixes({
                    DD_TRACE_AGENT_HOSTNAME: undefined,
                });

                // an unset variable used to stringify to "undefined", which
                // skipped every URL that happened to contain that word
                assert.equal(
                    toSkip('https://api.example.com/undefined'),
                    false,
                );
                assert.equal(toSkip('undefined'), false);
            },
        );

        it('should treat absent and non-string input as not skippable',
            async () => {
                const { toSkip } = await loadFixes({
                    DD_TRACE_AGENT_HOSTNAME: 'dd-agent.internal',
                });

                assert.equal(toSkip(''), false);
                assert.equal(toSkip(undefined as unknown as string), false);
                assert.equal(toSkip({} as unknown as string), false);
            },
        );
    });

    describe('fixTraces()', () => {
        function wrappedTarget() {
            const calls: string[] = [];
            const original = () => {
                calls.push('original');

                return 'original';
            };
            const wrapped: any = () => {
                calls.push('wrapped');

                return 'wrapped';
            };

            wrapped.__wrapped = true;
            wrapped.__original = original;
            wrapped.__unwrap = () => calls.push('unwrap');

            return { calls, original, object: { method: wrapped } };
        }

        it('should do nothing while self-traces stay enabled', async () => {
            const { fixTraces } = await loadFixes({
                DISABLE_DD_SELF_TRACES: undefined,
            });
            const { object } = wrappedTarget();
            const before = object.method;

            fixTraces(
                [{ object, methodNames: ['method'] }],
                () => () => 'replaced',
            );

            assert.equal(object.method, before);
        });

        it('should replace wrapped methods once self-traces are disabled',
            async () => {
                const { fixTraces } = await loadFixes({
                    DISABLE_DD_SELF_TRACES: '1',
                });
                const { object, original } = wrappedTarget();

                fixTraces(
                    [{ object, methodNames: ['method'] }],
                    () => () => 'replaced',
                );

                assert.equal(object.method(), 'replaced');
                assert.equal((object.method as any).__wrapped, true);
                assert.equal((object.method as any).__original, original);
                assert.equal(
                    typeof (object.method as any).__unwrap,
                    'function',
                );
            },
        );

        it('should hand the wrapped method and the original to the patcher',
            async () => {
                const { fixTraces } = await loadFixes({
                    DISABLE_DD_SELF_TRACES: '1',
                });
                const { object, original } = wrappedTarget();
                const seen: any[] = [];

                fixTraces(
                    [{ object, methodNames: ['method'] }],
                    (target, methodName, method, originalFn) => {
                        seen.push({ target, methodName, method, originalFn });

                        return () => 'replaced';
                    },
                );

                assert.equal(seen.length, 1);
                assert.equal(seen[0].methodName, 'method');
                assert.equal(seen[0].originalFn, original);
                assert.equal(seen[0].method.__wrapped, true);
            },
        );

        it('should leave methods Datadog never wrapped alone', async () => {
            const { fixTraces } = await loadFixes({
                DISABLE_DD_SELF_TRACES: '1',
            });
            const plain = () => 'plain';
            const object: any = { method: plain };

            fixTraces(
                [{ object, methodNames: ['method'] }],
                () => () => 'replaced',
            );

            assert.equal(object.method, plain);
        });

        it('should ignore method names absent from the target', async () => {
            const { fixTraces } = await loadFixes({
                DISABLE_DD_SELF_TRACES: '1',
            });
            const object: any = {};

            assert.doesNotThrow(() => fixTraces(
                [{ object, methodNames: ['nope'] }],
                () => () => 'replaced',
            ));
            assert.equal(object.nope, undefined);
        });
    });

    describe('fixDDTraces()', () => {
        it('should be a no-op when self-traces are left enabled', async () => {
            const { fixDDTraces } = await loadFixes({
                DISABLE_DD_SELF_TRACES: undefined,
            });
            const before = http.request;

            fixDDTraces();

            assert.equal(http.request, before);
        });
    });
});
