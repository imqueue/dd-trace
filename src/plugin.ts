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
import { ImqClientPlugin } from './client.js';
import { CompositePlugin } from './internals.js';
import { ImqServerPlugin } from './server.js';

/**
 * The `imq` integration, grouping both halves of an RPC call under a single
 * name so that they share configuration and can be switched independently:
 *
 * ~~~typescript
 * tracer.use('imq', { client: false });    // trace incoming calls only
 * tracer.use('imq', { service: 'my-api' }) // applies to both halves
 * ~~~
 */
export class ImqPlugin extends CompositePlugin {
    public static id = IMQ_COMPONENT;

    public static get plugins() {
        return {
            client: ImqClientPlugin,
            server: ImqServerPlugin,
        };
    }
}

export default ImqPlugin;
