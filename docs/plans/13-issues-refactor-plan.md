# 13 Audit Issues Implementation Plan (Target Release: v0.4.0)

## Block 1: Hygiene, Dependencies, Security & Schema Core
- [x] **Task 1 (Refs: #91)**: Repository hygiene — deleted 13 merged branches on origin, cleaned up root DEV stray files, deduplicated Gitea issue labels.
- [ ] **Task 2 (Refs: #86)**: Standalone test execution — declare `@deepseek-ai/schemastery` in devDependencies so `npm test` passes on a fresh clone.
- [ ] **Task 3 (Refs: #82)**: `/save-key` security hardening — strictly validate `envName` to prevent overwriting unrelated credentials.
- [ ] **Task 4 (Refs: #80)**: Plan models decoupled from deprecated `enabledModels` — rely strictly on `disabledModels` so new plan models are enabled automatically.

## Block 2: Account Pool Real Failover & Persistence
- [ ] **Task 5 (Refs: #79)**: Real failover in DSH — register active account key in `llm-pi-ai`, intercept 429/quota-exceeded via `llm/stream` waterfall with storm protection (30s).
- [ ] **Task 6 (Refs: #81)**: Honest persistence error reporting — routes `/accounts/active`, `/models/toggle`, `/models/sync` fail loudly when persistence fails.
- [ ] **Task 7 (Refs: #88)**: SettingsPage cleanup & accounts pool UI — remove dead state and complete accounts pool card.

## Block 3: Telemetry, UI & Client Fixes
- [ ] **Task 8 (Refs: #83)**: Real session telemetry — collect token usage and request counts from `llm/stream` usage chunks.
- [ ] **Task 9 (Refs: #87)**: PluginCard fix — fix undeclared `ctx` variable reference.
- [ ] **Task 10 (Refs: #90)**: Accurate plan telemetry — remove hardcoded $9.99/mo placeholder when plan API provides no price.

## Block 4: API Cleanup, Honest Auth & Behavioral Tests
- [ ] **Task 11 (Refs: #84)**: Honest auth status — replace mock browser login with direct ClinePass key link.
- [ ] **Task 12 (Refs: #89)**: Clean public surface — eliminate unused exports and legacy dead code paths.
- [ ] **Task 13 (Refs: #85)**: Behavioral route tests — replace string-matching assertions with real HTTP route handler invocation tests.