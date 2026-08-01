# Changelog

Notable changes to `@imqueue/datadog`.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.0] - 2026-08-01

The package is renamed from `@imqueue/dd-trace` to `@imqueue/datadog`. No export
changed name or signature, and — deliberately — nothing Datadog sees changed
either. The migration is the dependency and the import specifiers.

`@imqueue/dd-trace` is deprecated on npm and will receive no further releases.
There is no compatibility shim: 3.1.0, the last version published under the old
name, stays installable indefinitely and stays frozen.

### Changed

- **Renamed on npm.** `npm i @imqueue/datadog`, and update every import
  specifier. `dd-trace` named Datadog's own tracer, which this package wraps and
  depends on at `^6.6.0`, so `@imqueue/dd-trace` sitting next to `dd-trace` in a
  dependency list said very little about which was which. `datadog` says what the
  integration is for. The `dd-trace` keyword is kept so a search for the old name
  still finds it.

- **`repository.url`** points at `github.com/imqueue/datadog` and moves off the
  `git://` scheme GitHub disabled in 2022; **`bugs.url`** follows.

### Unchanged, on purpose

- **Everything Datadog sees.** The integration is still addressed as
  `tracer.use('imq', …)`, span names are still `imq.request` and `imq.response`,
  the component tag is still `imq`, the channel prefix is still `apm:imq:*`, and
  the kill switch is still `DD_TRACE_IMQ_ENABLED`. Dashboards, monitors and
  saved queries need no changes.

- **`CALL_CONTEXT` is still `Symbol.for('@imqueue/dd-trace:context')`** and the
  internal patch marker is still `__imqueueDdTracePatched`. Both are
  process-global identifiers, and `CALL_CONTEXT` is exported public API. Freezing
  them is what lets this package and a still-installed `@imqueue/dd-trace`
  recognise each other during a partial migration instead of double-patching the
  shared `@imqueue/rpc` option singletons or dropping spans on the floor. Same
  reasoning as `CARRIER_KEY`, frozen since 3.0.0.

  Even so, do not run both packages in one process. They patch the same
  singletons, and only one set of hooks can be the live one.

### Added

- **`publishConfig.access`**, so a first publish under a new scoped name cannot
  land as a restricted package.

- **`.github/workflows/build.yml`.** This was the only package of the three
  renamed in this wave with no build workflow, so nothing ran lint or tests on a
  tag push — the release path was `prepublishOnly: npm run build`, which compiles
  and never tests.

## [3.0.1] - 2026-07-26

A licensing correction only — no code changed, so 3.0.1 is functionally
identical to 3.0.0.

### Changed

- **License: ISC → GPL-3.0-only.** This package was the last one still
  declaring ISC after the framework-wide relicense, so it disagreed with the
  rest of @imqueue, with imqueue.org (which states the whole framework is
  GPL-3.0), and with its own `CONTRIBUTING.md` and `CONTRIBUTION-TERMS.md` —
  both of which already told contributors their work stays available to everyone
  under GPL-3.0. `package.json`, `LICENSE`, the README and the header of every
  source file now say GPL-3.0-only, matching every sibling package.

  If you consumed 3.0.0 or earlier under ISC terms, note that GPL-3.0's copyleft
  applies from 3.0.1 on. A proprietary commercial license is available for
  closed-source use — contact <support@imqueue.com>.

## [3.0.0] - 2026-07-26

Every dependency moved to its latest release, which turned out to require
rebuilding how this package hooks into the tracer: it was written against
`dd-trace` 0.x internals and had stopped working long before this release.

### Fixed

- **The package threw on import.** `src/redis.ts` required
  `dd-trace/packages/dd-trace/src/plugins/util/redis`, which last existed in
  `dd-trace` 2.x, so `import '@imqueue/dd-trace'` failed with
  `MODULE_NOT_FOUND` on the `^5.25.0` it depended on.
- **No imq call was traced.** Integrations were registered by assigning arrays
  of `{ name, versions, file, patch, unpatch }` descriptors — the `dd-trace` 0.x
  format — into the tracer's plugin registry. Since 2.x the registry holds
  plugin classes and every entry is checked with `typeof Plugin !== 'function'`,
  so those arrays were dropped without a word.
- **Redis stopped being traced entirely.** Overriding the `redis` registry entry
  with such an array disabled Datadog's own Redis integration instead of
  extending it.
- **`trace()`, `traceEnd()` and `@traced()` threw `TypeError`.** They read
  `tracer.scope()._spans`, and `_spans`, `_current` and `_exit` are not part of
  the tracer's scope any more. Parenting now uses the public
  `scope().active()`.
- `toSkip()` escaped only the first dot of `DD_TRACE_AGENT_HOSTNAME`, so
  `dd.agent.local` also matched hosts like `ddXagentXlocal`. With the variable
  unset it matched the literal string `"undefined"`, skipping any URL
  containing that word; now nothing is matched by host instead.
- `test/mocha.opts` had not been read by mocha since mocha 8; the settings live
  in `.mocharc.json` now. `eslint` linted compiled output next to the sources,
  and `globals` was imported by the eslint config without being declared as a
  dependency.

### Changed

- **Breaking: this package is now an ES module.** `@imqueue/rpc` 3.x is
  ESM-only, which a CommonJS package cannot import for anything but types.
- **Breaking: the Redis override is gone**, along with the
  `service.name: imq-broker-redis` tag it applied. Redis spans come from
  `dd-trace`'s own integration, which works again.
- Reimplemented as `dd-trace` plugin classes over diagnostics channels: an
  `imq` composite plugin with a `client` and a `server` half, publishing on
  `apm:imq:request:*` and `apm:imq:response:*`. Either half can be disabled
  with `tracer.use('imq', { client: false })`.
- Hooks are installed into the public `DEFAULT_IMQ_CLIENT_OPTIONS` and
  `DEFAULT_IMQ_SERVICE_OPTIONS` of `@imqueue/rpc` rather than through
  `dd-trace`'s automatic module patching, which needs the tracer loaded before
  `@imqueue/rpc` — not something an ESM application can guarantee. Hooks an
  application configured itself are kept and run after the tracing ones.
- An incoming call now always starts its own trace when the caller propagated
  no context, instead of attaching to whatever span happened to be active.
- `@imqueue/core` was dropped from the dependencies: nothing imported it, and
  `@imqueue/rpc` re-exports it anyway.
- `typescript` is held at `~6.0.3`, the newest release the toolchain accepts —
  `@typescript-eslint` 8 requires `<6.1.0` and `typedoc` 0.28 supports up to
  `6.0.x`. TypeScript 7 needs both to move first.
- `nyc` gave way to `c8`, which can measure ES modules; `ts-node` and
  `mock-require` are gone with it, and specs run against the compiled output so
  that `tsc` gates the test run. `chai` was replaced by `node:assert`.
- `typedoc-plugin-as-member-of` was removed: it loads a `typedoc` path that is
  no longer exported, which broke `npm run doc` outright, together with the
  `--mode file` flag `typedoc` dropped in 0.23.

### Added

- A test suite — the package had none. 41 specs covering both plugin halves,
  trace propagation between them, hook installation, and the environment
  handling in `src/fixes`.
- `test/internals.spec.ts` pins every unsupported `dd-trace` internal this
  package relies on, so a future upgrade that moves one fails by name rather
  than silently emitting no traces.
- `npm run lint` and `npm run lint:fix`: `eslint` was configured but no script
  ever ran it.
