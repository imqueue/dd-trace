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
    /**
     * Span to parent the new one to. Pass `null` explicitly to force a root
     * span — omitting it lets the tracer pick whatever is active, which is
     * rarely what an entry point wants.
     */
    childOf?: any;

    /** Datadog span kind, `'client'` or `'server'`. */
    kind?: string;

    /** String tags for the span. */
    meta?: Record<string, any>;

    /** Numeric measurements for the span. */
    metrics?: Record<string, number>;

    /** What the span operated on — the field Datadog groups by. */
    resource?: string;

    /** Service the span is attributed to. */
    service?: string;

    /** Span type, e.g. `'messaging'`. */
    type?: string;
}

/**
 * Structural type of dd-trace's `TracingPlugin`. Only the members this package
 * actually uses are described.
 */
export interface TracingPluginType {
    /** The tracer instance, used to inject and extract trace context. */
    tracer: any;

    /** Resolved configuration for this plugin. */
    config: any;

    /**
     * Starts a span.
     *
     * @param name - operation name
     * @param options - span attributes; see {@link StartSpanOptions}
     * @param enterOrCtx - `true` enters the span into the async-local store, so
     *         spans created afterwards become its children. Use it for server
     *         spans and NOT for client spans, which must not become the ambient
     *         parent while awaiting a reply.
     */
    startSpan(
        name: string,
        options?: StartSpanOptions,
        enterOrCtx?: boolean | object,
    ): any;

    /** Applies configuration, called by the tracer's plugin manager. */
    configure(config: any): void;
}

/**
 * Static shape of a `TracingPlugin` subclass. The statics are how the tracer
 * derives which channels a plugin subscribes to.
 */
export interface TracingPluginConstructor {
    /** Constructs the plugin. Called by the tracer's plugin manager. */
    new(...args: any[]): TracingPluginType;

    /** Integration name, as passed to `tracer.use()`. */
    id?: string;

    /** Component tag reported on the plugin's spans. */
    component?: string;

    /** Operation half, forming the `apm:<component>:<operation>:*` prefix. */
    operation?: string;

    /** Datadog span kind. */
    kind?: string;

    /** Datadog span type. */
    type?: string;

    /** Channel prefix override, when the default is not wanted. */
    prefix?: string;
}

/**
 * Static shape of a `CompositePlugin` subclass — an integration made of several
 * named halves that can be configured independently.
 */
export interface CompositePluginConstructor {
    /** Constructs the composite. Called by the tracer's plugin manager. */
    new(...args: any[]): { configure(config: any): void };

    /** Integration name, as passed to `tracer.use()`. */
    id?: string;

    /**
     * The halves, keyed by the name each is configured under — `client` and
     * `server` for this package's {@link ImqPlugin}.
     */
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
 * @param name - registry key of the plugin to enable
 */
export function publishLoad(name: string): void {
    channel(LOAD_CHANNEL).publish({ name });
}

/**
 * Adds `DD_TRACE_<ID>_ENABLED` to the tracer's configuration allow-list.
 *
 * The plugin manager reads that variable while enabling any plugin, and
 * dd-trace throws a "Missing env/configuration in
 * supported-configurations.json" error for every name it does not know — which
 * would take the whole process down through an uncaught exception, since the
 * lookup happens inside a diagnostics channel subscriber.
 *
 * @param id - plugin id, as declared by its `static id`
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
