# Changelog

All notable changes to `@goodandready/dsh-clinebot` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
