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
import { IMQ_COMPONENT } from './channels.js';
import {
    allowPluginEnvConfig,
    pluginRegistry,
    publishLoad,
} from './internals.js';
import { clientHooks, installHooks, serverHooks } from './instrumentation.js';
import { ImqPlugin } from './plugin.js';

export * from './channels.js';
export * from './client.js';
export * from './instrumentation.js';
export * from './internals.js';
export * from './plugin.js';
export * from './server.js';

/**
 * Registry key the plugin is announced under. It is the name of the traced
 * package, matching what dd-trace uses for its own integrations.
 */
export const REGISTRY_KEY = '@imqueue/rpc';

let registered = false;
let instrumented = false;

/**
 * Registers the `imq` integration with the tracer.
 *
 * Safe to call more than once, and safe to call before `tracer.init()` — the
 * tracer only instantiates the plugin once it has been configured.
 *
 * @remarks
 * Called for you when this package is imported, so applications never need it.
 * It is exported for tests and for a host that builds the tracer by hand.
 *
 * @returns `true` if this call performed the registration, `false` if it had
 *         already happened
 */
export function registerPlugin(): boolean {
    if (registered) {
        return false;
    }

    allowPluginEnvConfig(IMQ_COMPONENT);
    pluginRegistry[REGISTRY_KEY] = ImqPlugin;
    registered = true;

    return true;
}

/**
 * Enables the registered plugin. Separate from registration because the
 * tracer's plugin manager ignores the announcement until it has a
 * configuration, which `tracer.init()` gives it.
 */
export function enablePlugin(): void {
    registerPlugin();
    publishLoad(REGISTRY_KEY);
}

/**
 * Installs the tracing hooks into `@imqueue/rpc`.
 *
 * The hooks land on the default client and service options, so every client and
 * service created afterwards is traced without touching application code. This
 * deliberately does not use dd-trace's automatic module patching: that path
 * needs the tracer loaded before `@imqueue/rpc`, which cannot be guaranteed for
 * an ESM application, whereas the default options are read when a client or
 * service is constructed — always after this call.
 *
 * @remarks
 * Called for you at import time, so applications never need it. Note what the
 * timing implies: a client or service constructed BEFORE this ran copied the
 * un-hooked defaults and is not traced.
 *
 * @returns `true` if this call installed the hooks, `false` if they were
 * already installed
 */
export async function instrument(): Promise<boolean> {
    if (instrumented) {
        return false;
    }

    const {
        DEFAULT_IMQ_CLIENT_OPTIONS,
        DEFAULT_IMQ_SERVICE_OPTIONS,
    } = await import('@imqueue/rpc');

    const client = installHooks(DEFAULT_IMQ_CLIENT_OPTIONS, clientHooks);
    const server = installHooks(DEFAULT_IMQ_SERVICE_OPTIONS, serverHooks);

    instrumented = client || server;

    return instrumented;
}

export default ImqPlugin;
