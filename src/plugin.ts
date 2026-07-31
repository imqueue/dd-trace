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
import { ImqClientPlugin } from './client.js';
import { CompositePlugin } from './internals.js';
import { ImqServerPlugin } from './server.js';

/**
 * The `imq` integration, grouping both halves of an RPC call under a single
 * name so that they share configuration and can be switched independently.
 *
 * @remarks
 * This is what `tracer.use('imq', ...)` addresses. Being a composite, an option
 * given without a half applies to both, while `client` and `server` target one
 * each:
 *
 * ```typescript
 * tracer.use('imq', { client: false });     // trace incoming calls only
 * tracer.use('imq', { service: 'my-api' }); // applies to both halves
 * ```
 *
 * Registered with the tracer automatically when this package is imported; there
 * is no reason to instantiate it yourself.
 */
export class ImqPlugin extends CompositePlugin {
    /**
     * Integration name, `'imq'` — the string to pass to `tracer.use()` and the
     * key of the `DD_TRACE_IMQ_ENABLED` environment switch.
     */
    public static id = IMQ_COMPONENT;

    /**
     * The two halves this integration is composed of, which is what makes
     * `{ client: false }` and `{ server: false }` valid options.
     */
    public static get plugins() {
        return {
            client: ImqClientPlugin,
            server: ImqServerPlugin,
        };
    }
}

export default ImqPlugin;
