# Changelog

All notable changes to `@goodandready/dsh-clinebot` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.23] - 2026-09-24

### Fixed
- The settings page binds `configForms.get('dsh-clinebot')` on DSH 0.1.7. The removed `settingsScope` and `lanSettings` services are no longer consulted, so the plugin configuration page can render after install.
- `GET /dsh-clinebot/status`, `/config`, `/usage`, and `/auth/status` use the same trusted-request check as the write routes. Usage responses keep the quota fields the card shows and omit the raw provider payload.
- `/cline models` prints the model total in English.

## [0.3.22] - 2026-09-24

### Fixed
- **SettingsPage Crash on Cordis Strict Context (#67 / GitHub #4)**: Fixed unhandled `TypeError: cannot get property "settingsScope" without inject` thrown when accessing `ctx?.settingsScope` under DSH 0.17+ / Cordis v3+ strict proxy contexts. Replaced bare property access with defensive `ctx.get('lanSettings') || ctx.get('settingsScope')` inside `try/catch` across both `settings-page.js` and `entry.js`.
- **Standalone Unblocked UI Rendering**: When `settingsScope` / `lanSettings` service is absent or not injected in the client fiber, `SettingsPage` snapshot now defaults to `{ status: 'ready', view: null }` instead of permanently hanging on `status: 'loading'`. The settings page is entirely functional via its own HTTP REST endpoints (`/dsh-clinebot/status`, `/save-key`, `/models/toggle`, etc.).

## [0.3.21] - 2026-09-23

### Fixed
- **Account Failover Persistence & Cache Invalidation (#61)**: Fixed `rotateToNextAccount` returning `rotated: true` when settings persistence (`settingsApi.replace` or `settings.mutate`) fails. It now returns `{ rotated: false, activeAccount: active, reason: 'failed_to_persist' }` on failure, and defers `clearUsageCache()` and `clearProbeCache()` until settings are confirmed written. This prevents the provider from staying on the previous account while its quota and health telemetry caches are wiped.

## [0.3.20] - 2026-09-23

### Fixed
- **Web Boot Freeze Hotfix (#64 / GitHub #3)**: Removed non-existent `configForms` service from client `inject: ['slots', 'locale']` and cleared `dsh.client.inject: []` in `package.json`. In version 0.3.19, Cordis in the browser hung indefinitely waiting for `configForms`, causing DSH startup to fail with `Failed to load plugins / web boot: 1 entry did not activate / @goodandready/dsh-clinebot: pending (waiting for service: configForms)`.
- **Safe Fallback**: Retained safe optional chaining for settings mirror refresh (`(ctx?.get && ctx.get('lanSettings')) || ctx?.settingsScope`) without introducing hard service dependencies.

## 0.3.19

### Fixed
- Settings no longer wait on the removed settingsScope service. The client uses configForms (#62).

## [0.3.18] - 2026-09-22

### Added
- **Reasoning Effort (思考强度) Selection (#59)**: Enabled reasoning effort selection (`Off` / `Low` / `Medium` / `High` / `Max`) across DSH composer model picker and `dsh-effort-slider` for all supported reasoning models (Qwen 3.7 Max/Plus, MiMo 2.5/Pro, GLM 5.2, Kimi K3, DeepSeek V4 Pro/Flash, MiniMax M3).
- **Protocol Compliance**: Injected `off: null` into wire dictionary and declared `compat: { supportsReasoningEffort: true }` at provider and model levels in accordance with `@earendil-works/pi-ai` protocol specifications.
- **Dynamic Plan Model Reasoning Heuristics**: Added automatic detection of reasoning capabilities for dynamically discovered models matching `/qwen3\.7|mimo|glm-5|kimi-k3|deepseek-v4|minimax-m3/i`.
- **Reasoning Tooltip Localization**: Added localized explanatory tooltips (`models.reasoning_tooltip`) across English, Russian, and Chinese in the Settings UI.

### Fixed
- **Settings UI Reasoning Badge**: Fixed reasoning badge check in `models-section.js` to correctly detect object dictionary configurations instead of relying solely on array length.
- **Context Window Capacity Clarification**: Updated catalog documentation and descriptions to clarify that the uniform 200k tokens context parameter reflects the official ClinePass upstream completion proxy gateway limit.

## [0.3.17] - 2026-09-21

### Fixed
- **Cache Resilience (#50)**: Fixed permanent `isRevalidating` flag lock in `usageCache` and `probeCache` upon background SWR revalidation failures. The flag is now guaranteed to reset in `finally` and `catch` blocks.
- **Immediate Abort Handling (#52)**: Eliminated artificial 250ms delay and futile retry upon `AbortError` or `signal.aborted` in `fetchUsageLimits`.
- **Lifecycle Timer Cleanup (#53)**: Wrapped `autoDiscover` timer in `ctx.effect` with cleanup handler to avoid orphaned background callbacks upon plugin context unload.
- **UI Version Hardcode Removal (#56)**: Replaced hardcoded legacy `'0.3.12'` string in initial React state with dynamic retrieval from `/update` endpoint and conditional badge rendering.

### Performance
- **Single Account Pool Resolution (#51)**: Eliminated duplicate sequential IPC queries to DSH Credentials by passing the pre-resolved account pool into `resolveActiveAccountKey` within `buildStatus`.
- **Bounded Cache with Auto-Eviction (#57)**: Enforced `MAX_CACHE_ENTRIES = 50` and automatic eviction of expired entries in `usageCache` and `probeCache` to prevent long-term memory leaks.

### Refactored
- **Active Route Guard (#54)**: Converted `assertTrustedSettingsRequest` into an active route guard writing `403 Forbidden` and applied it across all write endpoints in `lib/routes/`.
- **Dead Export Wiring (#55)**: Wired `getDefaultModelIds` helper in `lib/config.js` to compute `allDefaultIds`, clearing preflight dead-export warnings.

## [0.3.16] - 2026-09-20

### Fixed
- **Strict Active Subscription Plan Model Filtering (#48)**: Correctly parsed `plan.features.included` array from `GET /users/me/plan` to discover exactly the 11 active ClinePass subscription models. Removed non-subscription models from the default `CLINE_MODELS` list (eliminating out-of-plan failures and preventing 400+ models from cluttering the DSH picker).
- **Array Parsing in `parsePlanIncludedModels`**: Added support for both string and array inputs (extracting feature entries matching `/includes\s+/i`).

## [0.3.15] - 2026-09-19

### Fixed
- **The settings form now appears on the plugin's own page.** The seat the Plugins
  page really renders as a plugin page with its configuration is a card in the
  plugin list (`plugins.item`) — the page draws the card's one-liner for
  `view: 'summary'` and the entry itself as the body of that page for
  `view: 'page'`. That is how `@goodandready-private/dsh-agentrouter` and
  `@goodandready/dsh-agent-orchestrator` have always shown their settings, while the
  `plugins.row.config` seat alone left the row without a configure control. The card
  is registered with `id: 'dsh-clinebot'`, order 60 and a static label; the row seat
  and the legacy `settings.plugin.item` card stay as fallbacks.

## [0.3.14] - 2026-09-19

### Fixed
- **The row-seat key is registered under both spellings.** The core keys a row's
  configuration page as `` `${bundle.name}#${rowId}` `` (`rowConfigKey` in
  `dsh-client-ui-plugin-manager`), and `bundle.name` may be either the package name
  (`@goodandready/dsh-clinebot`) or the short bundle name (`dsh-clinebot`) depending
  on how the manager builds its package view. Both keys are now registered for
  `plugins.row.config`, so the row's configure control appears whichever spelling the
  core compares against; the unused entry is inert.

## [0.3.13] - 2026-09-19

### Fixed
- **Settings reachable again**: the card registered into `settings.plugin.item`, a
  slot the current DSH core (0.1.6-alpha.2) no longer renders, so the plugin's
  settings were unreachable. The surface now registers into the Plugins page row
  seat `plugins.row.config` first, keyed
  `@goodandready/dsh-clinebot#dsh-clinebot` (`rowConfigKey(package, rowId)`): the
  plugin's row gains a configure control whose page is the settings form
  (`view: 'page'`, open and without our card chrome — the host page draws the title,
  icon, crumb and padding) plus a one-line state for `view: 'summary'`. The legacy
  seat stays registered as a fallback for older cores.
- The client module test now expects both seats in order.
- The change lives in `src/client/*`; `lib/client.js` is rebuilt by
  `npm run build:client` (also run by `npm test`).

## [0.3.12] - 2026-09-16

### Changed
- **Full Source Code Decomposition (< 600 Lines Limit)** (Gitea Issues #41, #29):
  - Split server-side `lib/index.js` (formerly 976 lines) into focused domain modules: `lib/access.js` (CSRF / origin security), `lib/config.js` (Schemastery configuration), `lib/provider-sync.js` (PiAi provider lifecycle & model discovery), `lib/slash-command.js` (`/cline` chat command), and `lib/routes/*` (`settings.js`, `accounts.js`, `models.js`, `auth.js`). Main entry point `lib/index.js` reduced to 148 lines.
  - Extracted `lib/account-pool.js` from `lib/cline-client.js`, reducing it from 684 to 557 lines.
  - Modularized client codebase into 16 clean source files in `src/client/` (< 480 lines each), separating locales, theme styles, error boundaries, and dedicated UI components.
  - Added zero-dependency `scripts/build-client.js` maintaining single-bundle DSH Store contract (< 256 KiB limit, actual size 57.7 KiB).
- **Test Suite Expansion**: Added `test/decomposition.test.js` validating line limits and exported domain interfaces (45 passing tests).

## [0.3.11] - 2026-09-16

### Added
- **One-Click In-App Update UI & Live Status Banner** (Gitea Issue #39): Rendered interactive update status bar in `PluginCard` / `SettingsPage`. Displays current installed version, live npm registry check indicator, and up-to-date status badge. Automatically reveals warning badge and 'Update Now' button (`update.btn`) when a newer version is released, triggering safe POST `/dsh-clinebot/update` with `x-dsh-plugin-update: 1` header and completion guidance.
- **Client Test Coverage Expansion**: Added component render assertions for one-click update UI elements and updated test state table to 41 passing unit tests.

## [0.3.10] - 2026-09-16

### Changed
- **UI Color Contrast & Adaptive Theme Compliance** (Gitea Issue #27): Replaced all hardcoded `rgba(...)` background tints and borders with CSS `color-mix(in srgb, var(--dsw-alias-state-...) X%, transparent)` for full legibility across Light and Dark DSH themes.
- **Kernel Chevron Icon Probe & Fallback** (Gitea Issue #28): Added dynamic safe probe for kernel `IconChevronDownOutline14` from `@deepseek-ai/dsh-client-ui-primitives` with pixel-perfect FallbackChevron and `.cb-chevron` / `.cb-chevron-open` rotation classes.
- **Single-Bundle Runtime Contract Documentation** (Gitea Issue #29): Formalized client single-bundle architecture and decoupled backend design in `docs/design/DESIGN.md`.
- **Packaging Sanitization & Denylist Enforcement** (Gitea Issues #25, #26, #30): Purged internal workflow files (`AGENTS.md`, `index.md`, `deploy.sh`, `release-notes.md`) from git tracking and added them to `.gitignore`. Removed redundant duplicate READMEs in `docs/` and outdated root `.tgz` artifacts, reducing unpacked package size to 200 KiB.
- **Client Module Injection Contract Clarification** (Gitea Issue #32): Documented that `dsh.client.inject: []` in `package.json` is architectural canon for plugins consuming core services (`slots`, `locale`, `settingsScope`) via `exports.inject` rather than require-table imports.
- **Immediate Quota & Probe Invalidation on Account Switch** (Gitea Issue #31): Connected `clearUsageCache()` and `clearProbeCache()` to account switching routes (`/accounts/active`, `/cline switch`) and `rotateToNextAccount()`, preventing quota telemetry from lagging or sticking to former accounts.
- **Model Validation in Slash Command** (Gitea Issue #31): Integrated `isSupportedModel()` in `/cline test [model]` to validate target models upfront before issuing upstream requests.


### Fixed
- **LLM Provider Schema Alignment (`reasoningEfforts`)** (GitHub Issue #1, Gitea Issue #35): Fixed Cordis loader validation failure (`$.providers.clinebot.models[0].reasoningEfforts expected false | { [key]: string } but got ["low","medium","high"]`). Properly map array reasoning efforts into a validated object record `{ [effort]: effort }` or `false`, resolving startup provider crash.
- **Client Localization Fallback Crash** (Gitea Issue #34): Fixed `ReferenceError: ru is not defined` in `lib/client.js` fallback registration path when `ctx.effect` is absent. Removed direct reference to deleted `ru` dictionary.
- **Settings Persistence Error Visibility** (Gitea Issue #33): Replaced empty/silent `catch {}` blocks around settings persistence in `lib/client.js` and `lib/cline-client.js` with structured warning logs (`ctx.logger.warn`) and user-facing error banners (`setErr`).
- **Semantic Version Prerelease Comparison in Host Updater** (Gitea Issue #23): Enhanced `isNewerVersion()` in `lib/updater.js` to strictly follow SemVer 2.0.0 rules for pre-release tags, ensuring pre-releases and release candidates update seamlessly.
- **Hardened Write-Route Security Validation** (Gitea Issue #22): Strengthened `isTrustedSettingsRequest()` in `lib/http.js` to rigorously validate `Origin`, `Host`, `X-Forwarded-Host`, `Referer`, and loopback remote addresses against CSRF, while maintaining full support for reverse proxies and local LAN environments.

## [0.3.9] - 2026-09-15

### Added
- **Stale-While-Revalidate (SWR) Quota Caching**: Integrated SWR caching into `fetchUsageLimits` with a 20-second TTL. Instantaneous (<2ms) responses on `/dsh-clinebot/status` and `/dsh-clinebot/usage` with background revalidation.
- **Smart Quota-Aware Failover**: Account rotation automatically skips exhausted accounts (>=95% 5h usage) and selects the account with the lowest `percentUsed`. Supports auto-recovery once `resetsAt` timestamp is reached.
- **One-Click In-App Updater (`/dsh-clinebot/update`)**: Added canonical DSH updater endpoint (`lib/updater.js`) validating loopback origin, same-origin, and `x-dsh-plugin-update` header for safe in-app upgrades.
- **Complete Chinese Localization (`zh`)**: Added comprehensive native Chinese dictionary (67+ translation keys) to `lib/client.js`.
- **DSH Canon Compliance**: Cleanly separated external Russian translation (supplied via `dsh-russian-lang`), and normalized all slash command outputs to canonical English.

### Fixed
- **Code Deduplication**: Eliminated duplicate credential and account pool helper functions between `lib/index.js` and `lib/cline-client.js`.
- **Network Keep-Alive & Cloudflare Handling**: Enforced persistent keep-alive connections on outbound requests and improved error extraction on HTML challenge responses.

## [0.3.8] - 2026-09-12

### Added
- **Stale-While-Revalidate (SWR) Network Probe** (Issue #18): Introduced in-memory SWR caching (`probeCache`) with 25s TTL for host health probes (`probeHealth`), reducing settings card status endpoint latency from ~500ms to <1ms on repeated calls while revalidating asynchronously in the background.
- **HTTP Keep-Alive Connection Reuse**: Added persistent `keepalive: true` connection options across all HTTP calls (`probeHealth`, `smokeChat`, `fetchUsageLimits`) to eliminate recurrent TCP/TLS handshakes to `api.cline.bot`.
- **Auto-Failover Account Rotation**: Implemented `rotateToNextAccount` to automatically rotate active accounts in the configured pool when encountering HTTP 429 rate limits or 100% quota exhaustion, instantly synchronizing DSH `llm-pi-ai` credentials without restarting.
- **Accurate Token Telemetry**: Extracted real usage metrics (`prompt_tokens`, `completion_tokens`, `total_tokens`) from chat completion responses, replacing static estimation counters.
- **Expanded Slash-Commands**: Extended `/cline` chat command with `/cline test [model]` (live smoke verification), `/cline ping` (real-time host connectivity test), and `/cline rotate` (manual failover).
- **Curated Models Catalog Expansion**: Added Claude 3.7 Sonnet (Hybrid Reasoning), GPT-4.5 Preview, o3-mini, Gemini 2.5 Pro / Flash, and Qwen 2.5 Coder 32B to the official `CLINE_MODELS` catalogue.
- **Debounced Model Picker Toggles**: Added 280ms debounce for model exclusion persistence in `lib/client.js`, providing 0ms UI checkbox responsiveness and preventing network request thrashing.

## [0.3.7] - 2026-09-10

### Fixed
- **Canonical Settings Namespace Registration** (Issue #16): Moved settings declaration in `lib/index.js` to `ctx.inject(['settings'], (sctx) => { sctx.settings.register(NS, Config, { base: config }) })`, guaranteeing synchronous/asynchronous namespace availability and reactive config watching via `live()`.
- **Top-Level Section Removal**: Removed the unauthorized fallback to `settings.section` in `lib/client.js`, strictly confining the plugin UI to the standard `settings.plugin.item` slot under Settings → Plugins → Plugin Settings.
- **Safe Service Resolution**: Replaced direct property access `ctx.credentials` with safe proxy lookup `(ctx?.get && ctx.get('credentials')) || ctx?.credentials`.
- **Client Mirror Invalidation & Scope Sync**: Added `refreshMirrorUntilVisible(ctx)` in `lib/client.js` to trigger settings mirror re-reads until the namespace is visible in the web client, and synchronized multi-account changes directly through `scope.set('activeAccount', accountEnv)`.
- **Duplicate-Safe Locales**: Wrapped client dictionary registration with duplicate-safe guards (`ctx.locale.register()`) preventing registration collision errors.

## [0.3.6] - 2026-09-09

### Fixed
- **Restored `handleSmoke` diagnostics handler**: Re-introduced missing `handleSmoke` click callback in `SettingsPage`, fixing `handleSmoke is not defined` runtime error during Diagnostics card interaction.
- **Defensive ErrorBoundary child rendering**: Hardened `ErrorBoundary.render()` with `this.props?.children || null` to prevent unhandled exceptions if props are omitted.
- **Comprehensive UI render integrity test**: Added recursive VDOM component tree evaluation test in `test/client-modules.test.js` covering all 190+ elements and verifying definition of all 18 event handlers.

## [0.3.5] - 2026-09-09

### Fixed
- **Settings Card React Crash & ErrorBoundary Isolation**: Wrapped `PluginCard` and `SettingsPage` with a defensive `ErrorBoundary` preventing unhandled render exceptions from unmounting the card.
- **useSyncExternalStore Stability**: Eliminated object allocations inside `getSnapshot` callback when `settingsScope` is detached or resolving, resolving infinite render loops (`Maximum update depth exceeded`).
- **Resilient Context & Reset Time Formatting**: Guaranteed fallback to module `ctx` inside `PluginCard` and added safe parsing for high-precision ISO timestamps in rolling quota progress bars.

## [0.3.4] - 2026-09-08

### Fixed
- **Cache Path Resolution**: Corrected POSIX home directory expansion (`~/`) in `resolvePathWithHome` so `~/.dsh/clinebot-models-cache.json` resolves cleanly to `/home/vadim/.dsh/...` instead of root-level paths.

## [0.3.3] - 2026-09-08

### Added
- **Multi-Account Pool & Fast Rotation** (Issue #8): Added full account pool support (`accounts: [{ label, apiKeyEnv }]`, `activeAccount`). Users can configure multiple ClinePass keys across personal and team subscriptions, view configuration statuses in the dedicated settings card, and pin/switch active accounts instantly without restarting DSH.
- **Web Search Integration Alignment** (Issue #9): Investigated Cline API search capabilities; confirmed search operations are natively executed via model tool-calling without requiring separate search-engine tokens or intermediate providers.
- **Fast 1-Click Browser Login Flow** (Issue #10): Added interactive browser authorization (`POST /dsh-clinebot/auth/begin` and status polling), streamlining onboarding and credential entry directly from the web settings interface.
- **Native Reasoning Effort Controls** (Issue #11): Configured `reasoningEfforts: ['low', 'medium', 'high', 'max']` on supported thinking models (`deepseek-v4-flash`, `deepseek-v4-pro`, `kimi-k3`, `minimax-m3`). Exposes native thinking controls in DSH model picker and UI badge `🧠 Reasoning`.
- **Extended Slash-Command Subcommands** (Issue #12): Enhanced `/cline` with powerful subcommands:
  - `/cline models` — Lists all available models with context length, Vision modality, and reasoning support.
  - `/cline accounts` — Displays configured account pool, active key, and environment binding status.
  - `/cline switch <label>` — Dynamically switches the active key across the account pool directly from chat.
  - `/cline quota` (default) — Full rolling quota breakdown with warning indicators and session metrics.
- **Resilient Retry Policy & Backoff** (Issue #13): Added exponential backoff retry mechanism (`retryWithBackoff`) intercepting transient 429 rate-limiting responses, `Retry-After` headers, and 5xx upstream hiccups.
- **Informative Badges & Model Meta Tags** (Issue #14): Enriched model catalogue metadata with compact human-readable badges (`[200K · Vision · Coding · Reasoning]`), Vision detection, and category filtering.
- **Offline Cold-Start Disk Caching** (Issue #15): Added persistent JSON disk caching (`saveModelsDiskCache`, `loadModelsDiskCache`) at `~/.dsh/clinebot-models-cache.json`. Newly discovered plan models survive offline restarts and cold boots without blocking startup.

## [0.3.2] - 2026-09-08

### Added
- **Automatic Plan Models Discovery**: Dynamic subscription plan models are parsed and registered automatically upon plugin startup and key configuration without requiring manual sync clicks.
- **`disabledModels` Selection Model**: Migrated model activation state to `disabledModels`. Any newly added models in the ClinePass subscription plan are enabled automatically by default, while user exclusions are reliably preserved.
- **Instant Non-Blocking Settings Status**: Limited background health check and quota ping timeout to 2500 ms in `buildStatus()`, rendering settings immediately and avoiding UI freezes on cold start or network hiccups.
- **Full DSH English & Russian Localization**: Complete translation dictionary coverage (`en` canonical and `ru`) across headers, badges, quotas, models table, metrics, and diagnostics.
- **Dynamic New Model Badges**: Newly discovered models received directly from the user's subscription plan now feature an informative `New` badge in the model picker.

### Fixed
- **DSH Registration Automation**: Provider registration in `llm-pi-ai` is now fully declarative and synchronized automatically when API credentials or model choices change. Removed redundant manual registration requirement.

## [0.3.1] - 2026-09-07

### Fixed
- **Style Isolation Attribute**: Added `data-dsh-plugin="dsh-clinebot"` (`style.dataset.dshPlugin`) to dynamically injected CSS tag in `lib/client.js`, protecting styles from cleanup during neighbor plugin HMR and profile updates.

## [0.3.0] - 2026-09-05

### Added
- **Dynamic Subscription Models Sync**: Added integration with official ClinePass plan endpoint (`GET /api/v1/users/me/plan` -> `features.included`). Models available under the user's subscription plan are parsed dynamically, mapped with fallback IDs, and synced directly to DSH provider configuration without requiring manual updates.
- **Strict Real Provider Catalog**: Replaced manual custom model entry forms with one-click dynamic synchronization (`POST /dsh-clinebot/models/sync` and UI sync button), eliminating out-of-sync manual model entries and guaranteeing 100% provider alignment.
- **Rolling Window Quota Exhaustion Warnings**: Added real-time threshold detection and prominent UI warning banners when the 5-hour rolling limit reaches 80% (warning, amber) and 95% (exhausted, red), complete with dynamic countdowns to reset.
- **Session Metrics & Usage Tracking**: Added in-memory session telemetry displaying total requests executed, estimated prompt/completion/total tokens, last roundtrip latency, and timestamp of the last request in a dedicated UI metrics card.
- **Extended `/cline` Slash-Command**: Slash-command now outputs quota warning banners and active session metrics (total calls, tokens, last request) alongside rolling window progress bars.
- **Canonical Deployment Script**: Added `deploy.sh` script conforming to dhsplugins standard for automated profile installation and service restart (Issue #3).

### Fixed
- **Slot Registration Smell**: Fixed dual unconditional slot registration: plugin card now registers primarily in `settings.plugin.item`, with graceful fallback to `settings.section` if not declared (Issue #5).
- **Settings Snapshot Status & Reactivity**: Integrated reactive `ctx.settingsScope` binding with `useSyncExternalStore`, checking snapshot status (`ready`, `loading`, `unavailable`) and propagating edits via `scope.set()` (Issue #6).
- **Slot Locales**: Attached `locale: NS` to slot options and registered localized dictionaries with `ctx.locale.register()` (Issue #7).
- **Button Hover State**: Fixed CSS button hover visibility regression on primary action buttons.

## [0.2.1] - 2026-09-05

### Fixed
- **Client Bundle Inject Compatibility**: Resolved client-side inject bundle loading for DSH web profile runtime.

## [0.2.0] - 2026-09-04

### Added
- **Dedicated Settings Page**: Added standalone Settings section in DSH (`settings.section`, order 28, menu item **ClineBot**) alongside the compact plugin card (`settings.plugin.item`).
- **Quota & Usage Limits Dashboard**: Integrated real-time tracking of official ClinePass rolling windows (`GET /users/me/plan/usage-limits`):
  - 5-hour rolling limit progress bar with countdown to window reset.
  - Weekly limit progress bar with percentage remaining.
  - User account email and monthly renewal cycle tracking.
- **In-UI Secure Key Storage**: Added field to paste API keys directly in the web UI, safely saving into DSH credentials storage (`~/.dsh/.credentials.yaml`) via `ctx.credentials.set(credentialRef(apiKeyEnv), key)`.
- **Custom Models Manager**: Added UI form to register new ClinePass models (ID, name, context size, Vision support) directly into the catalog without waiting for plugin updates.
- **Model Picker Management**: Granular checkboxes to enable/disable models exposed to the DSH chat picker, with quick filters ("All", "Vision Only", "Coding", "Recommended").
- **Slash-Command `/cline`**: Registered chat slash-command showing subscription status, quota progress bars, ping latency, and active model.
- Extended automated unit test suite (`test/cline-client.test.js`, `test/models.test.js`) with 9 tests covering usage limits, custom models, and credential storage.

## [0.1.0] - 2026-09-04

### Added
- Initial release of `@goodandready/dsh-clinebot`.
- Curated static catalogue for 11 official ClinePass open-weights models (`lib/models.js`).
- Native OpenAI-compatible client wrapper with health probes and latency-measuring smoke chat completions (`lib/cline-client.js`).
- Cordis service module injecting `settings`, `webServer`, and `credentials` with automatic DSH `llm-pi-ai` provider registration (`lib/index.js`).
