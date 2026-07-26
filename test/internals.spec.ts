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
import { createRequire } from 'node:module';
import {
    allowPluginEnvConfig,
    CompositePlugin,
    LOAD_CHANNEL,
    pluginRegistry,
    TracingPlugin,
} from '../src/internals.js';

const require = createRequire(import.meta.url);

const CONFIGURATIONS =
    'dd-trace/packages/dd-trace/src/config/supported-configurations.json';

/**
 * dd-trace offers no supported way to add an integration from outside its own
 * package, so this one reaches into its internals. These assertions spell out
 * exactly what it assumes, so that a dd-trace upgrade moving any of it fails
 * here — loudly, and by name — instead of silently producing no traces.
 */
describe('dd-trace internals this package depends on', () => {
    it('should still expose the tracing plugin base class', () => {
        assert.equal(typeof TracingPlugin, 'function');
        assert.equal(
            typeof TracingPlugin.prototype.startSpan,
            'function',
            'TracingPlugin#startSpan is how every span here is created',
        );
    });

    it('should still expose the composite plugin base class', () => {
        assert.equal(typeof CompositePlugin, 'function');
        assert.equal(typeof CompositePlugin.prototype.configure, 'function');
    });

    it('should still expose a mutable plugin registry', () => {
        assert.equal(typeof pluginRegistry, 'object');
        assert.equal(
            Object.isFrozen(pluginRegistry),
            false,
            'registration works by assigning into this object',
        );
    });

    it('should keep the registry keyed by module name, holding constructors',
        () => {
            // dd-trace drops any entry that is not callable, so an integration
            // registered as an object or an array would be ignored in silence
            assert.equal(typeof (pluginRegistry as any).redis, 'function');
            assert.equal((pluginRegistry as any).redis.id, 'redis');
        },
    );

    it('should still gate plugins on a per-integration env variable', () => {
        const config = require(CONFIGURATIONS);
        const allowList = config.supportedConfigurations || config;

        assert.equal(
            Array.isArray(allowList.DD_TRACE_REDIS_ENABLED),
            true,
            'the allow-list shape entries are copied from is gone',
        );

        allowPluginEnvConfig('imq');

        assert.deepEqual(
            allowList.DD_TRACE_IMQ_ENABLED,
            [{ implementation: 'A', type: 'boolean', default: 'true' }],
        );
    });

    it('should normalize a scoped id the way dd-trace does', () => {
        const { normalizePluginEnvName } = require(
            'dd-trace/packages/dd-trace/src/util',
        );
        const config = require(CONFIGURATIONS);
        const allowList = config.supportedConfigurations || config;

        allowPluginEnvConfig('@scope/some-lib');

        const expected = normalizePluginEnvName(
            'DD_TRACE_@SCOPE/SOME-LIB_ENABLED',
        );

        assert.equal(
            Object.keys(allowList).includes(expected),
            true,
            `expected the allow-list to gain ${ expected }`,
        );

        delete allowList[expected];
    });

    it('should still name the load channel the plugin manager listens on',
        () => {
            const dc = require('dc-polyfill');

            assert.equal(LOAD_CHANNEL, 'dd-trace:instrumentation:load');
            assert.equal(
                dc.channel(LOAD_CHANNEL).hasSubscribers,
                true,
                'the plugin manager must be subscribed, or announcing a ' +
                'loaded module does nothing',
            );
        },
    );
});
