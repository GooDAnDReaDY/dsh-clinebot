# Changelog

All notable changes to `@goodandready/dsh-clinebot` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
