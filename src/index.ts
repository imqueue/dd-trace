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
 * @return {boolean} - whether registration happened on this call
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
 * Installs the tracing hooks into @imqueue/rpc.
 *
 * The hooks land on the default client and service options, so every client and
 * service created afterwards is traced without touching application code. This
 * deliberately does not use dd-trace's automatic module patching: that path
 * needs the tracer loaded before @imqueue/rpc, which cannot be guaranteed for
 * an ESM application, whereas the default options are read when a client or
 * service is constructed — always after this call.
 *
 * @return {Promise<boolean>} - whether the hooks were installed, which is
 *         `false` when they had already been installed earlier
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
