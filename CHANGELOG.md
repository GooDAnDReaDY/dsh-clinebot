# Changelog

All notable changes to `@goodandready/dsh-clinebot` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-04

### Added
- Initial release of `@goodandready/dsh-clinebot`.
- Curated static catalogue for 11 official ClinePass open-weights models (`lib/models.js`).
- Native OpenAI-compatible client wrapper with health probes and latency-measuring smoke chat completions (`lib/cline-client.js`).
- Cordis service module injecting `settings`, `webServer`, and `credentials` with automatic DSH `llm-pi-ai` provider registration (`lib/index.js`).
- Zero-build web UI card for DSH Settings in slots `settings.plugin.item` and `settings.section` with live status badges, interactive model selectors, and smoke test runner (`lib/client.js`).
- Comprehensive unit test suite with 100% pass rate (`test/models.test.js`, `test/cline-client.test.js`).
- Complete documentation in English (`README.md`), Russian (`README.ru.md`), and Chinese (`README.zh.md`).
