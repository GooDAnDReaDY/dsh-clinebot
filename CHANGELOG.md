# Changelog

All notable changes to `@goodandready/dsh-clinebot` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.11] - 2026-10-01

### Fixed
- **Dynamic Stats Storage Switching & Counter Preservation (Issue #158)**: Flushes and synchronizes in-memory metrics before switching file storage targets when `statsPath` is updated dynamically, avoiding overwriting accumulated statistics when paths change.
- **Session Affinity Native Transport Bridge via Prompt Cache Key (Issue #163)**: Bridge native DSH `llm-pi-ai` requests to ClineBot sticky sessions by enabling `cacheRetention: 'long'` in the provider contract, and extracting session identifiers from `prompt_cache_key` on the proxy route, maintaining consistent account affinity across turns.
- **Catalog Lifecycle & Cache Identity Isolation (Issue #168)**: Isolated disk model cache records by specific account and endpoint scopes, clearing dynamic model cache and sync timestamps on active account switch, and reporting `planSynced: false` when offline cached plans cannot be actively verified against the provider.
- **Updater Process Group Escalation on Parent Exit (Issue #172)**: Ensured process group supervision continues after parent SIGTERM exit in `updater.js`, checking `isProcessGroupAlive(child.pid)` and escalating to SIGKILL across the detached process group (`-child.pid`) to eliminate lingering background processes.
- **Transactional Account Delete Surgical Rollback & Retry (Issues #184, #187)**: Replaced full-config rollback with surgical restoration of removed accounts into fresh live configuration on secret deletion failure, preserving concurrent settings updates. Exposed partial deletion state (`partial: true`) and allowed safe retry of credential cleanup without HTTP 404 errors.
- **DESIGN Contract Alignment with Native Runtime Contracts (Issue #177)**: Synchronized `docs/design/DESIGN.md` with active implementation: documented native DSH transport bridge, dynamic catalog lifecycle, updater process group cleanup, and dynamic stats storage switching.
- **Regression & Hardening Test Coverage (Issue #173)**: Added regression tests for dynamic stats switching, shifting quota session stickiness, process group lifecycle escalation on parent SIGTERM, and transactional partial account deletion and retry.

## [0.5.10] - 2026-10-01

### Fixed
- **Native Cosmokit Volatile Box & Proxy Target Preservation (Issues #157, #173)**: Preserved native Cosmokit `{ get }` volatile references without scalar overwrites during config mutations, and ensured extensible proxy targets for frozen configurations to prevent `TypeError: 'ownKeys' on proxy` invariants.
- **In-Memory Stats Retention Across Config Updates (Issue #158)**: Retained unwritten in-memory metrics across unrelated configuration saves (`PUT /config`) without reloading from disk or dropping unpersisted counters. Flushes pending metrics before switching storage paths when `statsPath` changes.
- **Account Pool Least-Used Routing on Empty Active Account (Issue #162)**: Allowed automatic least-used quota routing when `activeAccount` is set to an empty string or `"auto"`, preventing unintended pinning of the primary default account.
- **Native DSH Provider Compatibility Flag Normalization (Issue #163)**: Removed obsolete session affinity compatibility flags (`sendSessionAffinityHeaders`, `sessionAffinityFormat`) rejected by native DSH `llm-pi-ai`, restoring clean catalog registration and model resolution.
- **Disk Models Cache Isolation by Account & Endpoint (Issue #168)**: Keyed on-disk models cache (`saveModelsDiskCache`/`loadModelsDiskCache`) to specific account and endpoint identities, preventing cross-account model pollution and false `planSynced: true` indications in offline mode.
- **Process Group Termination & Zombie Prevention in Updater (Issue #172)**: Spanned updater processes with `detached: true` on POSIX, transmitting `SIGTERM` and `SIGKILL` across the entire process group (`-child.pid`) on timeout to guarantee complete termination of spawned child/grandchild processes and prompt lock release.
- **Session Router Bounded Memory Capacity on Manual Pin (Issue #183)**: Enforced strict capacity bounds (`MAX_SESSIONS = 1000`) on manual pin branches in `resolveSessionAccount`, ensuring LRU eviction and preventing unbounded memory growth.
- **Transactional Account Deletion & Secret Preservation (Issue #184)**: Persisted configuration updates prior to unsetting credentials in `handleDeleteAccount`, preventing irrevocable API key loss if settings persistence fails, and rolling back settings on credential deletion failures.
- **Non-Stream Proxy Response Body Deadline & Fail-Closed Error Handling (Issue #185)**: Wrapped non-streaming proxy response body reading in a `Promise.race` deadline bounded by `streamIdleTimeoutMs`, aborting upstream requests and returning HTTP 504 Gateway Timeout or 502 Bad Gateway with error metrics on stalls or socket drops instead of false HTTP 200 `{}`.
- **Localized Quota Countdown & Duplicate Chinese Reset Label Elimination (Issue #175)**: Added localized `quota.resetting` keys in `zh` ("正在重置") and `en` ("Resetting…") and handled resetting countdown states cleanly in `makeT` and `ProgressBar`, eliminating awkward "resetting后重置" strings.
- **Documentation & DESIGN Contract Alignment (Issue #177)**: Removed obsolete `settings.yaml` references across all documentation, updated runtime defaults (`cline-pass/deepseek-v4-flash`, timeouts 15s/25s/30s), documented 256 KiB control vs 64 MiB proxy body limits, and documented auto-routing policies.
- **Native DSH Adapter Integration Test Coverage (Issue #173)**: Added regression and integration tests verifying native DSH `llm-pi-ai` provider registration without `catalogError` and validating reactive volatile schema behavior.

## [0.5.9] - 2026-10-01

### Fixed
- **Updater Timeout Exit & SIGKILL Escalation (Issue #172)**: Ensured `installExact` child process cleanup waits for the operating system process to fully terminate via `exit`/`close` events before releasing profile locks or rejecting update promises. On timeout, sends `SIGTERM`, waits for a grace period, and escalates to `SIGKILL` for stubborn subprocesses.
- **Proxy Client Disconnection SSE Abort Fixture (Issue #173)**: Validated client disconnection handling against a real Node.js loopback HTTP fixture with client TCP stream destruction, asserting upstream `reader.cancel()` and fetch `signal.aborted` without relying exclusively on synthetic mocks.
- **Dependency Manifest & Lockfile Synchronization (Issue #174)**: Regenerated `package-lock.json` via clean npm resolution for all 21 dependencies to ensure deterministic, clean `npm ci` builds across environments, while maintaining proper exclusion of the lockfile from package archives.
- **UI Locale Key Completeness & Reasoning/Quota Strings (Issue #175)**: Resolved missing locale keys across `en` and `zh` dictionaries for structured quota countdowns/warnings, reasoning tags and effort selectors, capability badges, smoke test diagnostic outputs, and ErrorBoundary alerts. Added regression test asserting 100% dictionary completeness and symmetry for client `t()` calls.
- **Update Check State Machine & Error Handling (Issue #176)**: Implemented explicit update state machine (`idle`, `checking`, `current`, `available`, `error`) in `UpdateBanner` and `settings-page.js`. Eliminated false "✓ Up to date" status indicators on failed network checks or when `latestCheckFailed: true`, and added retry action.
- **Documentation & Design Contract Modernization (Issue #177)**: Synchronized `README.md`, `README.ru.md`, `README.zh.md`, and `docs/design/DESIGN.md` with active runtime contracts: documented dynamic subscription catalog, custom models, active configuration schema (`disabledModels`, `proxyMode`, `accounts`), corrected route prefixes (`/dsh-clinebot/*`), and documented all 4 registered UI seats and release testing workflows.

## [0.5.8] - 2026-09-30

### Fixed
- **Settings PUT Method & Form Error Recovery (Issue #156)**: Fixed `handleConfigPatch` in settings UI client to use `PUT /config` conforming to API routes and preserve unsaved form drafts on server errors.
- **Client Telemetry Wire Envelope Normalization (Issue #159)**: Fixed `statsSummary` in status payload to align with persistent storage format and accurately display model token consumption and totals.
- **Deduplication of Proxy & LLM Stream Telemetry (Issue #160)**: Avoided double-counting tokens and latency when requests pass through loopback proxy into `llm/stream`.
- **Proxy Error Mapping & 429 Header Preservation (Issue #166)**: Differentiated network unreachable/ECONNREFUSED errors as HTTP 502 Bad Gateway instead of false 429, and preserved upstream `Retry-After` headers.
- **Fetch Response Body Disposal Before Retry (Issue #167)**: Explicitly cancelled upstream HTTP response bodies before triggering retry or account failover on rate-limited or error attempts.
- **Dynamic Models Catalog Synchronization (Issue #168)**: Pruned deleted upstream models and reconciled metadata diffs on subscription plan updates using `isCatalogDifferent`.
- **Collision-Free Opaque Usage Cache Key (Issue #169)**: Replaced 8-character key suffix with SHA-256 hash of `baseUrl` and full API key to prevent cross-account cache collisions and protect key secrecy.
- **Custom Models Resolution Across Routes & Slash Commands (Issue #170)**: Forwarded user-defined custom models through catalog lookup, validation, `/cline test`, `/cline models`, and context configuration routes.
- **Local Proxy Bearer Token Redaction in Provider Settings (Issue #171)**: Omitted plaintext local proxy token from pi-ai provider descriptor and settings mutation payload, resolving authentication strictly through credential references.

## [0.5.7] - 2026-09-30

### Fixed
- **Active Account Pinning & Account Identity Unification (Issue #161)**: Resolved issue where proxy router ignored manually pinned active account and routed requests to secondary keys. Unified account identification across `id`, `apiKeyEnv`, and `label` in session routing, round-robin fallback, and cooldown tracking.
- **Account Pool Quota Metadata Enrichment (Issue #162)**: Provided real-time quota window utilization metadata (`remainingPercent`, `percentUsed`, `resetsAt`) to least-used account routing strategy. Handled unknown/unprobed quotas safely to prevent routing bias towards exhausted accounts.
- **Pi-AI Provider Session Affinity Header Propagation (Issue #163)**: Enabled `sendSessionAffinityHeaders: true` and `sessionAffinityFormat: 'openrouter'` in `@earendil-works/pi-ai` provider and model compatibility options. Expanded proxy session identification to extract session IDs from `x-session-id`, `x-dsh-session-id`, `session-id`, `x-session-affinity`, and client body parameters, preserving conversation affinity.
- **Client SSE Disconnection Upstream Abort (Issue #164)**: Monitored client response `close` events during streaming. Aborts upstream fetch and cancels ReadableStream reader immediately when a client disconnects prematurely, avoiding resource waste and orphaned upstream requests. Guarded writes and cleaned up listeners reliably.
- **Decoupled Connect Timeout & Streaming Idle Watchdog (Issue #165)**: Separated initial HTTP connect / header timeout (`connectTimeoutMs`, default 15s) from active streaming idle timeout (`streamIdleTimeoutMs`, default 30s). Prevented healthy long SSE streams from being cut off by monolithic timeouts. Added rearmable idle watchdog that signals client errors on stalls and accurately accounts failed streams with `isError: true` in token analytics instead of false successes.

## [0.5.6] - 2026-09-30

### Security
- **Credential Deletion Scope Enforcement (Issue #155)**: Restricted credential deletion on `DELETE /dsh-clinebot/accounts` and `POST /dsh-clinebot/accounts/delete` strictly to configured secondary accounts matching `^CLINEBOT_API_KEY(_[A-Z0-9]+)?$`. Prohibited deletion of the primary account. Unconfigured or invalid keys receive HTTP 400/404 without calling credentials store. Credential deletion errors return HTTP 500.

### Fixed
- **Atomic Settings Persistence & Volatile Lifecycle (Issue #157)**: Re-architected `settingsApi.replace` and `settingsApi.update` to persist changes via DSH `SettingsForms` *before* mutating live state. If settings service is unavailable or non-writable, explicit errors are thrown. Mutating in-memory configuration now preserves dynamic Volatile references and getters across updates without severance.
- **Cold Start Persistent Stats Loading & Flush on Dispose (Issue #158)**: Connected `loadStats(statsPath)` to plugin startup lifecycle in `apply()`, preventing cold starts from overwriting historical token metrics with empty counters. Added `flushStats()` effect hook on plugin disposal and automatic corrupted file preservation (`*.corrupt.<timestamp>`) for diagnostics.

## [0.5.5] - 2026-09-30

### Fixed
- **Volatile Boxes Unwrapping in Config Validation (Issue #153)**: Corrected deep unwrapping of Schemastery Volatile boxes and getters when passing dynamic configuration objects through `Config()` validation, preventing schema validation failures.

## [0.5.3] - 2026-09-28

### Fixed
- **Proxy Token Routing via DSH llm-pi-ai & Dual Bearer Auth (Issue #150, GitHub #11)**: In `@deepseek-ai/dsh-llm-pi-ai@0.1.7-rc.2`, the streaming runner (`streamWithSnapshot`) resolves request authorization strictly from `profile.apiKeyEnv` and completely ignores the literal `apiKey` field in the provider descriptor. When `proxyMode` is active, `upsertPiAiProvider` now correctly registers `apiKeyEnv: LOCAL_PROXY_KEY_ENV` (`CLINEBOT_LOCAL_PROXY_TOKEN`), while `lib/proxy-token.js` populates the credential store with the generated token value. In addition, `isAuthorizedProxyRequest` now accepts requests authenticated with either `CLINEBOT_LOCAL_PROXY_TOKEN` or any valid account key configured in the active account pool, ensuring uninterrupted communication across streaming, non-streaming, and diagnostic invocations without HTTP 401 Unauthorized rejections.

## [0.5.2] - 2026-09-28

### Security
- **Proxy Endpoints Local Bearer Auth & CSRF Protection (Issue #145)**: Secured OpenAI-compatible proxy routes (`/dsh-clinebot/v1/chat/completions` and `/dsh-clinebot/v1/models`) by generating a unique local proxy token (`CLINEBOT_LOCAL_PROXY_TOKEN`) passed as `apiKey` to the DSH provider. Requests missing or with invalid Bearer tokens receive HTTP 401 Unauthorized. Incoming browser requests containing `Origin` or `Sec-Fetch-Site: cross-site|same-site` are rejected with HTTP 403 Forbidden to protect against LAN abuse and cross-site request forgery.

### Added & Improved
- **Test Suite Isolation Sandbox (Issue #146)**: Introduced `test/_setup.mjs` configuring a dedicated temporary filesystem sandbox for `HOME` and `DSH_HOME` during automated test runs. Updated `lib/stats-storage.js` and `lib/provider-sync.js` to respect `DSH_HOME`. Added protective test verifying real `~/.dsh` files are untouched.
- **Dynamic Proxy User-Agent & Upstream Timeout Failover (Issue #147)**: User-Agent in proxy upstream requests now dynamically reflects the exact package version from `package.json`. Upstream completions use an abort timeout (`AbortSignal.any`); upon timing out, the request automatically rotates to the next available account in the pool, returning HTTP 504 Gateway Timeout if all accounts fail.
- **Self-Updater Concurrency Lock & Argument Cleanup (Issue #148)**: Removed deprecated `--config.minimumReleaseAge=0` flag from `dsh plugin add` invocations. Added `package.json.lock` verification inspecting PID liveness: active installations return HTTP 409 Conflict with PID, while stale locks from terminated processes are cleaned up automatically.

## [0.5.1] - 2026-09-28

### Fixed
- **Host Process Crash on Stats Save (Issue #141, GitHub #9)**: Safely unwrap volatile Schemastery `{ get }` references, getter functions, and non-string inputs in `resolvePath`. Wrapped `saveStatsSync` in `try/catch` inside `queueSaveStats` timer callback to guarantee disk persistence failures never become uncaught exceptions terminating the DSH host process. Updated `lib/index.js` to pass `publicConfig(live()).statsPath`.
- **Large Context / Multimodal Proxy Rejection (Issue #142, GitHub #10)**: Increased request body reading limit on `/dsh-clinebot/v1/chat/completions` from 256 KB to 64 MB, preventing HTTP 400 `"body too large"` errors on long conversational sessions and multimodal requests.
- **Model Cache Path Resolution (Issue #143)**: Added safe volatile reference and getter unwrapping to `resolvePathWithHome` in `lib/provider-sync.js`, preventing `TypeError [ERR_INVALID_ARG_TYPE]` on disk cache operations.

## [0.5.0] - 2026-09-27

### Security
- **Loopback Proxy Access Protection (#133)**: Strictly restricted OpenAI-compatible proxy endpoints (`POST /dsh-clinebot/v1/chat/completions` and `GET /dsh-clinebot/v1/models`) to loopback callers (`127.0.0.1`, `::1`, `localhost`). External network requests are rejected immediately with HTTP 403 Forbidden (`Loopback access only`).

### Added & Improved
- **Session Router Bounded Memory & LRU Eviction (#134)**: Introduced hard session limit `MAX_SESSIONS = 1000` and session expiration TTL `SESSION_TTL_MS = 24h` in `lib/session-router.js`. Prevents unbounded Map growth under high concurrency by pruning expired sessions and evicting least-recently-used sessions.

### Fixed & Cleaned
- **Dead & Test-Only Exports Elimination (#135)**: Pruned dead and internal-only exports across server modules (`USAGE_CACHE_TTL_MS` in `lib/cline-client.js`, `queueSaveStats` in `lib/stats-storage.js`, and `migrateModelId`, `getOriginalModelProvider`, `findModel`, `getDefaultModelIds` in `lib/models.js`), aligning module boundaries with public contract.
- **Design Token Purity in Progress Bar (#136)**: Replaced hardcoded fallback hex `#f87171` in `src/client/progress-bar.js` with semantic design system token `var(--dsw-alias-status-danger)`, eliminating color hardcodes across all client components.
- **Proxy Client Abort Stream Cancellation (#138)**: Connected `req.on('close')` in streaming SSE completions (`POST /dsh-clinebot/v1/chat/completions`) to immediately cancel upstream response reader via `reader.cancel()`, preventing orphaned background inference and quota drain when clients disconnect.
- **Circular Module Dependency Removal (#139)**: Eradicated artificial circular import cycle between `lib/cline-client.js` and `lib/account-pool.js` by removing legacy re-exports from `cline-client.js` and routing consumers directly to `lib/account-pool.js`.
- **Proxy Model Fallback (#140)**: Implemented seamless fallback to `pub.defaultModel` in `/dsh-clinebot/v1/chat/completions` when `model` parameter is omitted, preventing upstream HTTP 400 Bad Request.

## [0.4.8] - 2026-09-27

### Added
- **Transparent Loopback Proxy (#127)**: High-performance streaming proxy endpoints at `/dsh-clinebot/v1/chat/completions` and `/dsh-clinebot/v1/models` compatible with OpenAI spec. Features zero-downtime retry on HTTP 429 before stream commits, live SSE token tracking, and direct binding into DSH `llm-pi-ai` provider.
- **Sticky Session Least-Used Routing (#128)**: Session-aware routing selecting account with maximum quota remaining (`remainingPercent`) at session inception. Pins active session to selected account and triggers seamless failover on quota exhaustion or HTTP 429, with automatic cooldown expiration recovery.
- **Persistent JSON Token Analytics (#129)**: Atomic file-based telemetry storage at `~/.dsh/clinebot-stats.json` tracking cumulative prompt/completion tokens, requests, and rate limits across models and accounts with debounced write operations. Accessible via `GET /dsh-clinebot/stats` and resettable via `POST /dsh-clinebot/stats/reset`.
- **Per-Model Reasoning Effort Defaults & Custom Models (#130)**: Fine-grained `reasoning_effort` defaults (`low`, `medium`, `high`, `max`) per reasoning model in configuration and UI. Added support for user-defined custom models (`config.customModels`) integrated into dynamic catalog.
- **Quota UX & Proactive Monitoring (#131)**: Human-readable reset countdown timer (`formatResetCountdown`) for rolling weekly and monthly quotas, proactive warning banners in settings and progress bars when remaining quota drops below 10%, and monthly billing cycle visibility.

## [0.4.7] - 2026-09-27

### Fixed & Cleaned
- **Unused Imports Elimination (#121)**: Pruned dead imports across `lib/index.js` (`resolveKeyValue`, `smokeChat`, `fetchUsageLimits`, `checkRegisteredInPiAi`, `buildStatus`), `lib/config.js` (`getDefaultModelIds`), and `lib/routes/settings.js` (`isTrustedSettingsRequest`).
- **Design Contract Synchronization (#122)**: Updated `docs/design/DESIGN.md` Section 2.1 and Section 12.2 to accurately reflect DSH 0.1.7 settings architecture (`inject = ['webServer', 'credentials']`, direct `settingsApi` adapter, `docs/plans/` exclusion).
- **Peer Dependencies Alignment (#123)**: Removed obsolete `@deepseek-ai/dsh-settings` from `peerDependencies` in `package.json`, eliminating pnpm peer dependency installation warnings.
- **Repository Hygiene & Service Plans Exclusion (#124)**: Untracked internal implementation plan `docs/plans/13-issues-refactor-plan.md` and added `docs/plans/` to `.gitignore`.
- **Root Artifact Cleanup (#125)**: Removed stale packed `.tgz` archives from DEV root, ensuring clean workspace.

## [0.4.6] - 2026-09-25

### Fixed
- **Obsolete Settings Service Dependency Removal (#119)**: Removed ` settings` from `inject` and eradicated legacy `ctx.inject([settings], ...)` and `sctx.settings.register(...)` calls, adapting to DSH 0.1.7 kernel architecture where the Cordis `settings` service was removed.
- **Config Reader Export (#119)**: Exported `configReader(config)` returning `() => config` to provide standard DSH configuration introspection.
- **Defensive SettingsForms Adapter (#119)**: Implemented lightweight `settingsApi` adapter providing `get()`, `replace()`, `update()`, and `watch()` without declaring `settings` in `inject`, accessing `ctx?.get?.(settings)` defensively.
- **Failover & Settings Regression Tests (#119)**: Added 5 strict DoD regression tests verifying `inject`, absence of `settings.register`, proxy property safety, config reader, and strict proxy boot.

## [0.4.5] - 2026-09-25

### Fixed
- **Obsolete Model ID Migration & Canonical Normalization (#103)**: Automatically migrate historical model identifiers lacking dots (e.g., `deepseek-v41-flash` -> `deepseek-v4.1-flash`, `qwen38-max` -> `qwen3.8-max`, `glm-53` -> `glm-5.3`, `glm-53-flash` -> `glm-5.3-flash`, `muse-spark-13-contributor` -> `muse-spark-1.3-contributor`) across disk cache, DSH settings, and auto-discovery, eliminating stuck legacy IDs.
- **Config Schema Test Assertion for Schemastery 3.18.4 (#112)**: Aligned `test/config-schema.test.js` with Schemastery 3.18.4 volatile getter behavior using `plainConfig(validated).enabled`.
- **UI Color Compliance & Token Hardening (#116)**: Replaced hardcoded `rgba()` fallbacks in `accounts-section.js` and `models-section.js` with canonical DSH `color-mix()` and design tokens.
- **Decomposition Compliance (#117)**: Extracted credentials helpers into `lib/credential-refs.js`, reducing `lib/cline-client.js` from 590 to 511 lines (well below the 600-line ceiling).
- **Client Localization Pruning (#115)**: Removed 6 obsolete dead locale keys from `src/client/locales.js` in both `en` and `zh`.
- **Route Policy & Packaging Contract (#113)**: Documented mandatory «Политика маршрутов» (16 registered endpoints) and «Что публикуется» sections in `docs/design/DESIGN.md`.
- **Visual Verification Evidence (#114)**: Added dual-theme production visual verification artifact `media/visual-verification.png` and embedded under `## Visual verification` in `README.md`.

## [0.4.4] - 2026-09-25

### Added
- **Model Context Customization & Authentic Provider Specs (#110, GitHub #8)**: User-controlled context length configuration allowing custom context windows per model, resetting to gateway defaults (128K/200K), or one-click application of authentic original model specifications (Moonshot Kimi 2M, Alibaba Qwen 1M, MiniMax 1M, Xiaomi MiMo 1M, DeepSeek 128K, Zhipu GLM 128K).
- **Batch Context Controls (#110)**: Global 1-click batch actions in the models management header ("⚡ Original Specs" and "↺ Reset Contexts") to instantly apply or reset context windows across all models simultaneously.
- **Immediate DSH Provider Synchronization (#110)**: Dynamic synchronization of overridden context windows directly to `llm-pi-ai` provider settings, preventing chat sessions from prematurely compacting or truncating context at 128k/200k when larger context is selected.
- **Context Management Endpoint (`POST /dsh-clinebot/models/context`) (#110)**: Full REST route supporting single model updates (`modelId`, `contextLength`, `maxTokens`), single model resets (`reset: true`), batch mode `all-original`, batch mode `all-default`, and array bulk overrides.
- **Interactive UI & Localization (#110)**: Inline context badges, quick edit popover, clean token input, and bilingual English / Chinese localization across all context actions.

## [0.4.3] - 2026-09-24

### Fixed
- **DSH Settings Reload & DataCloneError Normalization (#96)**: Extended `plainConfig` in `lib/config.js` to recursively resolve functional getters (`() => current`), nested volatile getter objects, and arrays before passing configuration to `structuredClone`, completely eliminating `DataCloneError: () => current could not be cloned` during Cordis plugin reload and settings updates.
- **Config Schema Non-Volatile Alignment (#96)**: Removed the `.volatile()` marker from `planSyncedAt`, ensuring that internal synchronization timestamps are preserved as runtime state and not serialized into user settings forms.
- **Boot and Reload Regression Test (#96)**: Added regression tests covering deep functional getter resolution in `plainConfig` and verifying host boot/reload stability with profile-shaped `dynamicModels`.

## [0.4.2] - 2026-09-24

### Fixed
- **Slash Command Plain Text Formatting (#107)**: Eliminated raw markdown formatting (`###`, `**`, backticks) in `/cline` command responses, preventing unrendered markdown clutter in DSH chat `<pre>` blocks.
- **Single-Line Collapsed Summary (#107)**: Added a concise first-line summary strictly `<= 120` characters across all subcommands (`quota`, `models`, `accounts`, `stats`, `test`), displaying cleanly in the collapsed command card without premature line breaks or truncation ellipses.
- **Active Key Name Resolution (#107)**: Fixed `resolveActiveAccountKey` to consistently set both `apiKeyEnv` and `envName` for pooled and default accounts, preventing `Active Key: undefined` in command output and status payloads.

## [0.4.1] - 2026-09-24

### Fixed
- **Slash Command Contract Fix**: Fixed `/cline` slash command handler to strictly adhere to DSH `@deepseek-ai/dsh-commands` runtime `CommandResult` contract `{ kind: 'success', text }` instead of returning raw strings, preventing `TypeError: command "cline" handler must return a CommandResult` in DSH chat.
- **Provider Detection via SettingsForms describe() (#102)**: Updated `checkRegisteredInPiAi` to inspect `settings.describe()` descriptors directly without triggering `TypeError` on missing `get()` method in modern DSH `SettingsForms`. Added safe error absorption for `providers.clinebot` removal when already absent.
- **Model Version Dots Preservation (#103)**: Fixed model parsing to preserve version dot notation (e.g. `claude-3.5-sonnet`, `deepseek-v4.5`), preventing incorrect dot stripping or catalog matching errors.
- **Strict Credential Validation & HTTPS Key Verify (#82)**: Hardened `/save-key` and `/config` to strictly prevent bypassing `apiKeyEnv` naming rules (forbidding arbitrary standard env variables such as `OPENAI_API_KEY`), and enforced HTTPS for `/key/verify` remote endpoints.
- **Settings Rollback & Error Display (#81)**: Implemented optimistic UI rollback and explicit error alert banner when model toggle or settings persistence fails, reloading current server state and properly cleaning up debounced unmount timers.
- **Snapshot Warning Banner & Failover Localization (#104)**: Restored non-blocking warning banner when host `snapshotStatus === 'unavailable'`, and localized `Last failover: ...` via `t('accounts.last_failover')` across English and Chinese locale dictionaries.

### Added
- **Account Pool Form & Management Routes (#88)**: Completed full account pool UI with dedicated "Add Account" form (label, apiKeyEnv with auto-suggestions, secret input with show/hide toggle), account deletion with confirmation, model search input (`modelsSearch`), and category filter tabs (all, chat, coding, reasoning). Registered `POST /dsh-clinebot/accounts` and `POST /dsh-clinebot/accounts/delete` server endpoints.
- **Provider Key Failover Verification (#85)**: Added behavioral test assertions confirming that `rotateToNextAccount` mutates `llm-pi-ai` provider settings with the rotated account's `apiKeyEnv`, and replaced source code string inspection in `settings-service.test.js` with pure behavioral mock tests.
- **Repository Hygiene (#91)**: Pruned obsolete remote tracking branches, confirmed duplicate issue label resolution, and ensured clean working tree.

## [0.4.0] - 2026-09-24

### Added
- **One-Click In-App Updater (#91)**: Self-update companion plugin directly from the DSH settings card or via loopback `POST /dsh-clinebot/update` with rate limiting, package manifest verification, and restart indicators.
- **Real DSH Stream 429 & Quota Failover (#79)**: Intercepts HTTP 429 and quota exhaustion at the `llm/stream` waterfall level, automatically rotating to the next account in the pool with 30s storm protection and immediately synchronizing the provider's `apiKeyEnv` in `llm-pi-ai`.
- **Dynamic Plan Models Discovery (#90)**: Discovers models dynamically from active ClinePass subscription plan via `POST /dsh-clinebot/models/sync`. Removes hardcoded pricing references from UI and settings.
- **Stream Telemetry & Token Tracking (#83)**: Tracks real DSH chat requests through the ClineBot provider, prompt and completion tokens from stream usage chunks, stream latency, and error counts since process startup.
- **Live API Key Verification (#84)**: Direct navigation to `https://app.cline.bot/settings/api-keys` and on-the-fly key verification endpoint `POST /dsh-clinebot/key/verify` displaying account email and subscription plan in the UI.
- **Behavioral Test Suite (#85)**: Comprehensive test suite testing all write endpoints for HTTP 405 Method Not Allowed, HTTP 403 Forbidden on untrusted origins, service error reporting (503), and behavioral execution of all `/cline` slash subcommands.

### Changed
- **Hardened PUT /dsh-clinebot/config (#89)**: Merges from raw `live()`, accepts only known schema fields, strictly rejects unknown properties with 400 Bad Request, rejects deprecated `enabledModels`, and documents HTTP API in README.
- **Cordis 4 Clean apply() Return (#89)**: `apply()` now returns `undefined` to eliminate `TypeError: Invalid effect` in Cordis 4, and dead branches without `ctx.inject` were removed.
- **Strict Credential Naming Pattern (#82)**: Restricts `/dsh-clinebot/save-key` target environment variables strictly to `^CLINEBOT_API_KEY(_[A-Z0-9]+)?$`.
- **Honest Persistence Reporting (#81)**: Write endpoints report honest errors and HTTP 503 when the DSH settings service is unavailable.
- **UI and Locale Refinements (#86, #87, #88)**: Eliminated undeclared `ctx` reference in `PluginCard`, removed dead state loops in `SettingsPage`, corrected layout spacing and badge styling across localized cards.

## [0.3.25] - 2026-09-24

### Fixed

- **SettingsPage "Settings Unavailable" Banner Removal (#96 / GitHub #7)**: Removed the blocking `snapshotStatus === 'unavailable'` render gate in `SettingsPage`. When DSH serves no native settings form or when the page is accessed over non-loopback connections (`persistence === 'memory'`), the page no longer displays the dead-end warning banner and instead smoothly renders its fully functional standalone REST UI from `/dsh-clinebot/status` and `/dsh-clinebot/config`.
- **Modern DSH `SettingsForms` Adapter**: In `lib/index.js`, implemented a robust adapter for modern DSH `SettingsForms` (`svc.replace` / `svc.update` / `svc.describe`). DSH 0.1.7 removed `sctx.settings.register`, which previously caused `PUT /dsh-clinebot/config` to fail with HTTP 503 `settings not ready` and prevented key changes, account switching, and model toggles from persisting to DSH.
- **Volatile Field Projection (`volatileConfig`)**: Marked only user-editable settings as `.volatile()`, leaving internal derived fields (`dynamicModels` and deprecated `enabledModels`) non-volatile. Added `volatileConfig` helper to strip non-volatile fields before passing payloads to `SettingsForms.replace`, preventing DSH from rejecting configuration writes with `Config field is not volatile`.

## [0.3.24] - 2026-09-24

### Fixed

- The settings card opens. Host settings are published as a namespace, copied to plain values before use, and account credential names are read as text, so the form renders instead of a React error.

## [0.3.23] - 2026-09-24

### Fixed
- **React Error #185 Infinite Loop Fix (#74 / GitHub #6)**: Restored stable reference constant `SNAPSHOT_READY` in `SettingsPage.getSnapshot` for `useSyncExternalStore`. Returning an inline object literal caused `Object.is` mismatch on every render, triggering an infinite update depth loop (`Maximum update depth exceeded`). The snapshot fallback now returns frozen `SNAPSHOT_READY`, guaranteeing reference stability while keeping the page unblocked in standalone mode.
- The settings schema marks the user-editable fields volatile, so DSH includes the `dsh-clinebot` namespace and the configuration page is no longer stuck on "host namespace is not ready".
- Nested fields inside an already volatile array stay plain. The plugin copies host volatile references to plain values before `structuredClone`, so startup does not reject the config or fail to clone a getter.
- The configuration page renders its own status payload when the host form snapshot is still loading. A missing host namespace still shows the unavailable banner until that payload arrives.
- Account credential names are read as text. A host volatile reference was sent through as an empty object, and React error #31 replaced the settings card.
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
- **Cache Path Resolution**: Corrected POSIX home directory expansion (`~/`) in `resolvePathWithHome` so `~/.dsh/clinebot-models-cache.json` resolves under the user home directory instead of a root-level path.

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
