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
import { createRequire } from 'node:module';

/**
 * dd-trace exposes no public API for registering an integration of your own:
 * plugin base classes, the plugin registry and the configuration allow-list all
 * live under `dd-trace/packages/**` and are neither exported through the
 * package's entry point nor covered by its type definitions.
 *
 * Every such access is funnelled through this module so that the private
 * surface this package depends on is visible in one place. If a dd-trace
 * upgrade moves any of it, this is the only file that needs revisiting — and
 * `test/internals.spec.ts` fails loudly when that happens.
 */
const require = createRequire(import.meta.url);

const DD_PACKAGES = 'dd-trace/packages/';

/** Options accepted by `TracingPlugin#startSpan()`. */
export interface StartSpanOptions {
    childOf?: any;
    kind?: string;
    meta?: Record<string, any>;
    metrics?: Record<string, number>;
    resource?: string;
    service?: string;
    type?: string;
}

/**
 * Structural type of dd-trace's `TracingPlugin`. Only the members this package
 * actually uses are described.
 */
export interface TracingPluginType {
    tracer: any;
    config: any;
    startSpan(
        name: string,
        options?: StartSpanOptions,
        enterOrCtx?: boolean | object,
    ): any;
    configure(config: any): void;
}

export interface TracingPluginConstructor {
    new(...args: any[]): TracingPluginType;
    id?: string;
    component?: string;
    operation?: string;
    kind?: string;
    type?: string;
    prefix?: string;
}

export interface CompositePluginConstructor {
    new(...args: any[]): { configure(config: any): void };
    id?: string;
    plugins?: Record<string, unknown>;
}

/** Base class every tracing plugin derives from. */
export const TracingPlugin: TracingPluginConstructor =
    require(DD_PACKAGES + 'dd-trace/src/plugins/tracing');

/** Base class grouping several plugins under a single integration name. */
export const CompositePlugin: CompositePluginConstructor =
    require(DD_PACKAGES + 'dd-trace/src/plugins/composite');

/**
 * The tracer's plugin registry, keyed by the module name the load event is
 * published for. Assigning into it is the only way for a package that does not
 * live inside dd-trace to make its plugin discoverable.
 */
export const pluginRegistry: Record<string, unknown> =
    require(DD_PACKAGES + 'dd-trace/src/plugins');

/**
 * Name of the diagnostics channel the tracer's plugin manager listens on to
 * learn that an instrumented module has been loaded.
 */
export const LOAD_CHANNEL = 'dd-trace:instrumentation:load';

/** Channel factory shared with the tracer, see `./channels`. */
const { channel } = require(
    DD_PACKAGES + 'datadog-instrumentations/src/helpers/instrument.js',
) as { channel: (name: string) => { publish(ctx: unknown): void } };

/**
 * Announces a loaded module to the tracer's plugin manager, which is what makes
 * it instantiate and configure the registered plugin.
 *
 * @param {string} name - registry key of the plugin to enable
 */
export function publishLoad(name: string): void {
    channel(LOAD_CHANNEL).publish({ name });
}

/**
 * Adds `DD_TRACE_<ID>_ENABLED` to the tracer's configuration allow-list.
 *
 * The plugin manager reads that variable while enabling any plugin, and
 * dd-trace throws `Missing <name> env/configuration in
 * "supported-configurations.json"` for every name it does not know — which
 * would take the whole process down through an uncaught exception, since the
 * lookup happens inside a diagnostics channel subscriber.
 *
 * @param {string} id - plugin id, as declared by its `static id`
 */
export function allowPluginEnvConfig(id: string): void {
    const config = require(
        DD_PACKAGES + 'dd-trace/src/config/supported-configurations.json',
    );
    const allowList = config.supportedConfigurations || config;
    // Mirrors dd-trace's own `normalizePluginEnvName()`: it builds the variable
    // name first and normalizes the result, so a leading `@` is only stripped
    // when it starts the whole name — inside it, as in a scoped package id, it
    // becomes an underscore like any other character outside [a-z0-9_].
    const name = `DD_TRACE_${ id.toUpperCase() }_ENABLED`;
    const envName = (name.startsWith('@') ? name.slice(1) : name)
        .replace(/[^a-z0-9_]/ig, '_');

    if (!allowList[envName]) {
        allowList[envName] = [{
            implementation: 'A',
            type: 'boolean',
            default: 'true',
        }];
    }
}
