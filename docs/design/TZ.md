# ТЗ: `@goodandready/dsh-clinebot` — переход на собственный `LlmAdapter` и редизайн UI/UX

## 0. Метаданные

| Поле | Значение |
|---|---|
| Статус | Draft, к реализации |
| Целевой движок | DSH `0.2.1-rc.2` (единственная поддерживаемая версия) |
| Целевая версия плагина | `0.6.0` (major: удаление legacy-транспорта) |
| Область | Host runtime + Client UI + TUI + документация |
| Не входит | Поддержка DSH `0.1.x`, сторонние провайдеры, облачная телеметрия |

Документ заменяет прежний план «только UI-редизайн». Архитектурное решение: **отказаться от связки `llm-pi-ai` + loopback-прокси и зарегистрировать собственный `LlmAdapter` на `ctx.llm`**. UI-редизайн выполняется поверх нового адаптера, а не вместо него.

---

## 1. Краткое резюме

Сейчас плагин работает как надстройка над `llm-pi-ai`:

1. Мутирует `llm-pi-ai.providers.clinebot`.
2. Поднимает локальный HTTP-прокси `/dsh-clinebot/v1/*`.
3. Прокси выполняет failover, sticky sessions, учёт токенов, multimodal budget и отдаёт SSE в `pi-ai`.

Это работает, но является обходным путём. Провайдер не контролирует собственный request/response, а вся логика надёжности живёт в дополнительном сетевом слое. Отсюда: proxy token, порт, DesktopWebServer fence, 64 MiB limit, двойной учёт телеметрии, `provider-sync.js`, `llm/stream`-хук и невозможность корректно зарегистрировать `settings.models.provider-card`.

Целевое состояние:

- `clinebot` — полноценный provider route, зарегистрированный через `ctx.llm.registerAdapter(['clinebot'], adapter)`.
- `ctx.llm.registerConfigurableProviders([...])` объявляет провайдера для Settings → Models.
- Loopback-прокси для DSH-чата не используется.
- `llm-pi-ai` не мутируется.
- Телеметрия, failover, reasoning, images и usage находятся внутри адаптера.
- UI получает единый источник правды: `ctx.llm.listModels()` / `resolveModel()` + локальную аналитику.

---

## 2. Цели и не-цели

### 2.1 Цели

1. Убрать loopback-прокси из пути DSH-чата.
2. Зарегистрировать собственный `LlmAdapter` с полным контролем над стримингом, tool calls, reasoning, images и usage.
3. Сохранить и улучшить: multi-account failover, sticky sessions, least-used/round-robin, model routes, quota warnings, web search, обновление, статистику.
4. Получить нативную интеграцию с DSH `0.2.1-rc.2`: каталог моделей, context/maxTokens/reasoning metadata, `settings.models.provider-card`.
5. Перестроить UI в предсказуемую структуру: группы настроек, staged save, единый список аккаунтов, аналитика, нативные примитивы.
6. Поддержать TUI-профиль.
7. Довести инженерное качество: TypeScript-совместимые контракты, typecheck, golden-тесты, engine-compatibility.

### 2.2 Не-цели

- Поддержка DSH `0.1.7` и более ранних.
- Копирование Command Code-специфичных функций: ZDR, официальный OAuth, peak/off-peak, FREE/deal-модели, plan tiers.
- Полная замена `llm-pi-ai` для других провайдеров. Плагин перестаёт писать только `providers.clinebot`.
- Облачная телеметрия. Все данные остаются локальными.
- Гарантия точной стоимости ClinePass в долларах. ClinePass — подписка; стоимость показывается как оценка (`≈`) и может быть `unpriced`.

---

## 3. Текущая и целевая архитектура

### 3.1 Текущая

```
DSH agent loop
  -> llm-pi-ai (openai-completions)
    -> http://127.0.0.1:<port>/dsh-clinebot/v1
      -> loopback proxy server
        -> session-router / account-pool
        -> ClinePass /chat/completions
```

Проблемы:

- Провайдер зависит от внутренностей `pi-ai` и его настроек.
- `llm-pi-ai.providers.clinebot` — общий namespace, поэтому keyed-слот `settings.models.provider-card` нельзя однозначно привязать к ClineBot.
- Прокси — второй сетевой сервер в процессе DSH.
- Телеметрия пишется и в прокси, и в `llm/stream`-хуке, что требует дедупликации.
- `proxyMode`, `proxy-token`, `detectHostWebServerFence`, `startLoopbackProxyServer` — инфраструктура, которой не должно быть у LLM-провайдера.

### 3.2 Целевая

```
DSH agent loop
  -> ctx.llm.stream({ provider: 'clinebot', ... })
    -> ClineBotAdapter.stream(options)
      -> account-pool / session-router
      -> ClinePass /chat/completions (SSE)
      -> StreamChunk[]
```

Слои:

| Слой | Модуль | Ответственность |
|---|---|---|
| Provider route | `lib/adapter.js` | `LlmAdapter`, `stream`, `prepareCall`, `resolveModel`, `listModels`, `providerInfo`, `providerRetryPolicy` |
| Message mapping | `lib/adapter-messages.js` | DSH `RequestMessage[]` → OpenAI-compatible payload |
| Stream mapping | `lib/adapter-stream.js` | SSE/JSON ClinePass → `StreamChunk` |
| Transport | `lib/transport/cline-transport.js` | fetch, timeout, abort, retry, ошибки |
| Routing | `lib/account-pool.js`, `lib/session-router.js` | выбор и ротация аккаунта |
| Catalog | `lib/models.js` | план, контекст, reasoning, capabilities |
| Telemetry | `lib/stats-storage.js`, `lib/telemetry.js` | usage, сессии, стоимость |
| Settings/UI | `lib/routes/*`, `src/client/*` | настройки, аккаунты, квоты, аналитика |
| Search | `lib/web-search.js` | `ctx.web` provider |

---

## 4. Host runtime: `ClineBotAdapter`

### 4.1 Регистрация

В `lib/index.js` в `apply()`:

```js
import { ClineBotAdapter } from './adapter.js'

const adapter = new ClineBotAdapter({
  live,
  getSettingsApi: () => settingsApi,
  resolveAttachments: () => ctx.get('attachments'),
  logger: ctx.logger,
})

const registration = ctx.llm.registerAdapter(['clinebot'], adapter)
const directory = ctx.llm.registerConfigurableProviders([{
  provider: 'clinebot',
  displayName: 'ClineBot (ClinePass)',
  settingsNs: 'dsh-clinebot',
  settingsPath: [],
  defaultBaseURL: 'https://api.cline.bot/api/v1',
}])

ctx.effect(() => () => {
  directory()
  registration()
}, 'dsh-clinebot: llm adapter')
```

Требования:

- `settingsNs` обязан совпадать с namespace плагина (`dsh-clinebot`) — это ключ для `settings.models.provider-card`.
- `settingsPath: []` означает, что весь профиль `dsh-clinebot` описывает провайдера.
- Регистрация выполняется только при `enabled === true` и `transport === 'adapter'`.
- При `enabled === false` — `registration.replace([])` или dispose, без удаления настроек и ключей.
- Ошибка регистрации не должна валить `apply()`: логировать и оставлять настройки доступными.

### 4.2 Обязательные и рекомендуемые методы

| Метод | Обязателен | Назначение |
|---|---|---|
| `stream(options)` | да | Основной поток `StreamChunk` |
| `providerInfo(provider)` | рекомендуется | `{ id: 'clinebot', name: 'ClineBot (ClinePass)' }` |
| `listModels(provider)` | да для GUI | Каталог для picker/Models page |
| `resolveModel(provider, model, signal)` | да для GUI | `contextWindow`, `defaultMaxTokens`, `reasoning`, `inputModalities` |
| `prepareCall(provider, model, signal)` | рекомендуется | Связывает metadata и stream с одним поколением конфига |
| `providerRetryPolicy(provider)` | рекомендуется | Normal/always policy для `dsh-llm-retry` |
| `imageRequestPricing(...)` | опционально | Для ClinePass вернуть `undefined` (нейтральная оценка) |
| `imageRequestTarget(...)` | при images | Лимиты отправляемого изображения |

### 4.3 `stream(options)`

Алгоритм:

1. Прочитать live-конфиг: `const cfg = live()`, `const pub = publicConfig(cfg)`.
2. Проверить `pub.enabled`. Если выключено — `throw new LlmError('ClineBot disabled', 'PROVIDER_DISABLED')`.
3. Определить `sessionId` из `options.sessionId` (branded). Если нет — использовать `options.purpose`/`model` как fallback только для логов, не для sticky routing.
4. Собрать pool: `resolveAccountPool(ctx, cfg)`.
5. Выбрать аккаунт: `resolveSessionAccount(sessionId, pool, pub.activeAccount, pub.accountMode, options.model, pub.modelRoutes)`.
6. Собрать OpenAI body через `adapter-messages.js`.
7. Отправить fetch в `pub.baseUrl + '/chat/completions'`.
8. До первого валидного токена обрабатывать ошибки как retryable: 429, 402, 5xx, 401/403, сетевой сбой, TTFT timeout, ранний JSON-error в 200-стриме. При ошибке — `markAccountCooldown`, перейти к следующему аккаунту.
9. После первого токена заголовки/чанки уже принадлежат клиенту; mid-stream failover не выполняется. Ошибка завершает поток `finish { kind: 'error' }` или `aborted`.
10. На каждом `usage`-событии собрать `TokenUsage` и записать телеметрию.
11. На `finish` записать `recordUsage`/`recordSessionRequest` с `sessionId`, `accountId`, `ttftMs`, `latencyMs`, `model`, `purpose`, `isError`, `is429`.
12. При `options.signal.aborted` — `reader.cancel()`, `finish { kind: 'aborted' }`.

Таймауты:

- `connectTimeoutMs = pub.timeoutMs` (по умолчанию 15000).
- `streamIdleTimeoutMs = pub.streamIdleTimeoutMs` (по умолчанию 30000).
- `bodyTimeoutMs = pub.timeoutMs` для non-streaming.
- Все сигналы объединять через `AbortSignal.any([options.signal, connectCtrl.signal, idleCtrl.signal])`.
- TTFT timeout применяется только до первого валидного чанка.

### 4.4 `resolveModel()`

Возвращает:

```js
{
  provider: 'clinebot',
  id: model.id,
  name: model.name,
  description: formatModelDescription(model),
  inputModalities: model.input?.includes('image') ? ['text', 'image'] : ['text'],
  context: { contextWindow: model.contextLength },
  defaultMaxTokens: model.maxTokens,
  reasoning: hasReasoning ? {
    efforts: model.reasoningEfforts.map(id => ({ id, name: labelOf(id) })),
    defaultEffort: pub.modelReasoningDefaults[model.id],
  } : undefined,
}
```

Требования:

- `contextWindow` берётся из `modelContextOverrides` (per-model → wildcard → оригинал → gateway default).
- `defaultMaxTokens` — из `modelContextOverrides`/каталога.
- `reasoning.efforts` — только реально поддерживаемые моделью (`low`, `medium`, `high`, `max`; `off` не включать, если API не принимает `off`).
- `systemPromptUpdate` и `toolUpdate` не объявлять: каждый запрос отправляет полный tool list.
- Для неизвестной, но пользовательской модели вернуть минимальный корректный объект, не бросать.

### 4.5 `listModels()`

- Источник: `getAllModels(pub.dynamicModels, pub.modelContextOverrides, pub.customModels)`.
- Применить `disabledModels`.
- Применить `filterModelsByPlan`, если `planSynced` и план содержит модели.
- Применить `visibleModels` (allowlist после plan filter).
- Вернуть `LlmModelInfo[]`:
  - `provider: 'clinebot'`
  - `id`, `name`
  - `description`: `[200K · Vision · Coding · Reasoning] ...`
  - `inputModalities`
- Порядок: recommended → in-plan → остальные; stable sort по имени.
- Кэш: мемоизировать по `planSyncedAt + disabledModels + visibleModels + filterModelsByPlan + modelContextOverrides`. Инвалидировать на `loader/volatile-update`.

### 4.6 `prepareCall()`

```js
async prepareCall(provider, model, signal) {
  const cfg = live()
  const info = resolveModelFromConfig(cfg, model)
  return {
    model: info,
    stream: (options) => this.streamWithConfig(options, cfg),
  }
}
```

Требование: `streamWithConfig` использует именно захваченный `cfg`, чтобы смена настроек между `prepareCall` и dispatch не смешала поколения.

### 4.7 `providerRetryPolicy()`

Рекомендуемая политика:

```js
{
  mode: 'normal',
  maxRetries: 1,
  retryableCodes: ['RATE_LIMIT', 'TRANSPORT_ERROR', 'PROVIDER_ERROR'],
  backoff: { initialDelayMs: 500, maxDelayMs: 5000, jitterRatio: 0.1 },
}
```

Правила:

- Внутренний failover по аккаунтам — ответственность адаптера.
- Политика DSH не должна дублировать ротацию; `maxRetries: 1` — только для случая, когда альтернативных аккаунтов нет.
- `QUOTA_EXCEEDED`, `AUTH`, `INVALID_CREDENTIAL`, `CONTEXT_WINDOW_EXCEEDED` — не retryable.

### 4.8 `imageRequestTarget()` / `imageRequestPricing()`

- `imageRequestTarget(provider, model, image)`:
  - длинная сторона ≤ 1568 px;
  - encoded bytes ≤ 1 MiB;
  - вернуть `ImageRequestTarget`, соответствующий тому, что реально уходит в ClinePass.
- `imageRequestPricing()` — вернуть `undefined`: ClinePass — подписка, точной per-token цены изображения нет. Token meter использует нейтральную оценку.
- `ImageBlock.offloaded === true` — отправлять текстовый placeholder, не байты.

### 4.9 Маппинг сообщений

Модуль `lib/adapter-messages.js`.

Вход: `GenerateOptions.messages` (`RequestMessage[]`), `options.system`, `options.tools`, `options.toolHistory`.
Выход: OpenAI-compatible `{ messages, tools }`.

Таблица:

| DSH | OpenAI payload |
|---|---|
| leading `system` role message | `{ role: 'system', content: text }` |
| `options.system` | добавить system-сообщение перед `messages` |
| `user` + `text` | `{ role: 'user', content: text }` |
| `user` + `image` | `content: [{ type: 'text' }, { type: 'image_url', image_url: { url } }]` |
| `user` + `file` | текстовый handle (file никогда не уходит байтами) |
| `assistant` + `text` | `{ role: 'assistant', content: text }` |
| `assistant` + `reasoning` | `reasoning_content` (ClinePass/OpenAI-compatible), если модель reasoning |
| `assistant` + `tool-call` | `tool_calls: [{ id, type: 'function', function: { name, arguments } }]` |
| `user` + `tool-result` | `{ role: 'tool', tool_call_id, content }` |
| `developer` | system-сообщение (или объединить с system) |
| `tool-addition` / `tool-removal` | no-op: полный `options.tools` уже отправлен |
| `RequestUserInput` | как `user` без id/source |

Требования:

- Tool arguments — строка JSON, не объект.
- Пустые assistant-сообщения пропускать.
- Tool result с `isError: true` — префикс `[tool error]` в content (OpenAI не имеет отдельного поля).
- Reasoning block не отправлять в user/tool-result content.
- Порядок сообщений сохранять.
- Не отправлять `max_tokens`, если `pub.maxOutputTokens === 0`; иначе `min(model.maxTokens, pub.maxOutputTokens)`.

### 4.10 Маппинг стрима

Модуль `lib/adapter-stream.js`.

ClinePass SSE (OpenAI-compatible) → `StreamChunk`:

| ClinePass | StreamChunk |
|---|---|
| первый `delta.content` | `block-start { blockType: 'text' }` + `text-delta` |
| последующие `delta.content` | `text-delta` |
| `delta.reasoning_content` / `delta.reasoning` | `block-start { blockType: 'reasoning' }` + `reasoning-delta` |
| `delta.tool_calls[i]` | `block-start { blockType: 'tool-call' }`, затем `tool-call-delta { id, name?, argumentsDelta }` |
| конец блока | `block-end { block, index }` |
| `usage` | `usage { inputTokens, outputTokens, totalTokens?, cacheReadTokens?, cacheWriteTokens?, reasoningTokens? }` |
| `finish_reason: 'stop'` | `finish { reason: { kind: 'stop' } }` |
| `finish_reason: 'tool_calls'` | `finish { reason: { kind: 'tool-calls' } }` |
| `finish_reason: 'length'` | `finish { reason: { kind: 'max-tokens' } }` |
| abort | `finish { reason: { kind: 'aborted', failure } }` |
| ошибка | `finish { reason: { kind: 'error', failure } }` или throw `LlmError` |

Правила usage:

- `inputTokens` — **uncached** input: `prompt_tokens - cached_tokens`.
- `cacheReadTokens` — `prompt_tokens_details.cached_tokens`.
- `cacheWriteTokens` — если провайдер отдаёт `cache_creation_input_tokens`/аналог.
- `outputTokens` — `completion_tokens`.
- `reasoningTokens` — `completion_tokens_details.reasoning_tokens`.
- `totalTokens` — `total_tokens`, если есть.
- `usage` отправлять один раз, до `finish`, ничего после `finish`.

Tool calls:

- `tool-call-delta.id` — brand `ToolCallId(id)`.
- `name` передавать на первом дельте; далее только `argumentsDelta`.
- `block-end` содержит полный `{ type: 'tool-call', id, name, arguments }`.
- Если провайдер отдаёт несколько tool calls — отдельные индексы.

Reasoning replay:

- `finish.replayState.response` может содержать `{ reasoningContent, nativeFinishReason, providerRequestId }`.
- `finish.replayState.blocks` — по одному entry на блок, если нужно.
- На следующем запросе reasoning из assistant content отправлять как `reasoning_content`; replayState использовать только для provider-specific полей.

Ошибки:

- 401/403 → `LlmError(..., 'AUTH')` или `INVALID_CREDENTIAL`.
- 429 → `RATE_LIMIT`.
- 402/insufficient credits/usage limit → `QUOTA_EXCEEDED`.
- 400 context overflow → `CONTEXT_WINDOW_EXCEEDED`.
- 5xx → `PROVIDER_ERROR`.
- network/DNS/TLS → `TRANSPORT_ERROR`.
- В `LlmFailure` сохранять `status`, `providerRetryAfterMs`, `requestId`.

### 4.11 Failover и ротация

Внутри `stream()`:

1. `attempts = configuredAccounts.length` (минимум 1).
2. На каждой попытке:
   - `resolveSessionAccount(...)`;
   - если аккаунта нет — `LlmError('No available ClinePass API keys', 'MISSING_CREDENTIAL')`;
   - fetch;
   - non-200 retryable → `markAccountCooldown(accountId, 60000, null, reason)`, следующая попытка;
   - 200 stream → буферизовать первый валидный чанк;
   - early error в 200 → cooldown, следующая попытка;
   - первый валидный чанк → commit: отдать накопленные чанки и продолжить поток.
3. После commit ошибки не ретраятся; поток завершается `finish error`.
4. `Retry-After` сохранять в `LlmFailure.providerRetryAfterMs`.
5. Cooldown-причины: `upstream_429`, `upstream_auth`, `upstream_timeout`, `upstream_pre_token_error`, `upstream_status_<code>`.
6. Sticky session: `resolveSessionAccount` уже привязывает `sessionId` к аккаунту; при failover — обновить привязку.
7. `lastRotation` записывать для `/cline` и UI.

### 4.12 Одноразовая миграция с `pi-ai`

При первом запуске `0.6.0`:

1. Определить legacy-provider:
   ```js
   const svc = ctx.get('settings')
   const desc = svc?.describe?.().find(d => d.ns === 'llm-pi-ai')
   const exists = Boolean(desc?.value?.providers?.clinebot)
   ```
2. Если `exists` и `transport === 'adapter'`:
   ```js
   await svc.mutate('llm-pi-ai', [{ op: 'remove', path: ['providers', 'clinebot'] }])
   ```
3. Удалить credential `CLINEBOT_LOCAL_PROXY_TOKEN`, если он есть.
4. Остановить loopback-сервер, если он запущен.
5. Установить `legacyMigratedAt` (internal, non-volatile) — чтобы не повторять.
6. Не трогать другие provider entries в `llm-pi-ai`.

Правила:

- Ошибка миграции не блокирует adapter: логировать, но не удалять настройки пользователя.
- `proxyMode` помечается deprecated; UI скрывает его в adapter-режиме.
- При `transport === 'pi-ai'` старый путь продолжает работать ровно как раньше (один релиз).
- **Порядок активации:** `llm-pi-ai` монтируется из `dsh-base` раньше плагина и на первом boot может успеть объявить `clinebot` из legacy-конфига. Плагин всё равно удаляет legacy-entry и обслуживает запросы через adapter, но гарантированно чистый native route появляется со следующего boot. UI должен показать одноразовое уведомление «перезапустите DSH для завершения миграции».

### 4.13 Что удаляется / сохраняется

Удалить после стабилизации adapter-пути:

- `lib/proxy-server.js`
- `lib/proxy-token.js`
- `lib/routes/proxy.js`
- `lib/provider-sync.js` в текущем виде (оставить `buildStatus`, `resolveActiveAccountKey`, `formatProgressBar`; убрать `upsertPiAiProvider`, `removePiAiProvider`, `autoDiscoverPlanModels`-зависимость от pi-ai)
- `llm/stream`-хук из `lib/index.js`
- `proxyMode` из UI и publicConfig (оставить deprecated чтение на один релиз)

Сохранить:

- `lib/models.js`
- `lib/cline-client.js`
- `lib/account-pool.js`
- `lib/session-router.js`
- `lib/multimodal-budget.js` (адаптировать под DSH `ImageBlock`)
- `lib/stats-storage.js`, `lib/telemetry.js`
- `lib/web-search.js`
- `lib/routes/*` (кроме proxy)
- `src/client/*` (с последующим редизайном)
- `src/client/entry.js` слоты
- `cordis.patch.yml`

---

## 5. UI/UX редизайн

Редизайн выполняется после Phase 2 (adapter core), чтобы UI сразу опирался на нативный каталог и `settingsNs: dsh-clinebot`.

### 5.1 Слоты

| Слот | Ключ | Назначение |
|---|---|---|
| `settings.section` | `dsh-clinebot` | Основная страница настроек |
| `settings.models.provider-card` | `dsh-clinebot` | Карточка на Settings → Models |
| `sidebar.footer.action` | `clinebot-quota` | Квота в футере сайдбара |
| `main` | `clinebot-analytics` | Аналитика в центральной колонке |
| `conversation.composer.dock` | `clinebot-session-cost` | Стоимость текущей сессии |

Правила:

- `settings.models.provider-card` регистрируется keyed-слотом с `key: 'dsh-clinebot'`; компонент проверяет `props.provider.provider === 'clinebot'` и рендерит `null` для чужих провайдеров.
- `main`-панель регистрируется только если доступен `layout` (`ctx.inject(['layout'], ...)`); иначе аналитика открывается в modal.
- `sidebar.footer.action` остаётся опциональным: при `showSidebarQuota === false` рендерит `null` и не запускает polling.
- Все слоты оборачиваются в `ErrorBoundary`.

### 5.2 Информационная архитектура Settings → ClineBot

Порядок групп:

1. **Accounts**
   - primary key;
   - discovered keys;
   - account rows;
   - rotation mode;
   - model routes.
2. **Models & context** (collapsed by default)
   - plan filter;
   - visible models;
   - sync plan;
   - global context;
   - per-model overrides;
   - output limit;
   - reasoning defaults;
   - custom models;
   - TTFT probe.
3. **Usage & analytics**
   - quotas;
   - session totals;
   - open analytics;
   - CSV export;
   - reset stats.
4. **Integrations**
   - web search;
   - sidebar quota;
   - composer cost;
   - legacy proxy mode (deprecated, только в `pi-ai`-режиме).
5. **Diagnostics**
   - smoke test;
   - register/unregister;
   - update;
   - health.
6. **Advanced** (collapsed)
   - baseUrl;
   - timeouts;
   - statsPath;
   - modelsCachePath;
   - maxPayloadMb;
   - price overrides;
   - transport (`adapter` / `pi-ai`, временно).

Снизу — плавающий **SaveBar**:

- `pending` — есть несохранённые изменения;
- `saving`;
- `saved` — 2.5 секунды;
- `error` — ошибка сохранения, draft сохраняется;
- `Discard` / `Save`;
- disabled Save при invalid-полях;
- при сворачиваемой группе ошибка показывается на заголовке.

Правила:

- Настройки сохраняются одним `PUT /dsh-clinebot/config` только изменёнными полями.
- Операции с аккаунтами коммитятся сразу, не через SaveBar.
- Ошибка сервера не сбрасывает draft.
- `read-only` режим: все контролы disabled + баннер.

### 5.3 Accounts

Строка аккаунта:

- status dot: `active` (зелёный), `cooldown` (жёлтый), `invalid` (красный), `standby` (пустой);
- label, `apiKeyEnv`, source;
- plan/email;
- 5h/weekly meters inline;
- badges: `Active`, `Pinned`, `Missing key`, `Cooldown until ...`;
- меню `⋯`: pin/unpin, login/paste key, rename, clear key, delete;
- раскрытие: monthly credits, last rotation, model routes, last error.

Add account:

- `label` (optional);
- `apiKeyEnv` auto-suggest `CLINEBOT_API_KEY_N`;
- key input show/hide;
- verify via `POST /dsh-clinebot/key/verify` (debounce 500ms);
- save via `POST /dsh-clinebot/accounts`;
- discovered keys list via `GET /dsh-clinebot/keys/discovered`, import via `POST /dsh-clinebot/keys/discovered/import`.

Rotation mode:

- segmented control `least_used` / `round_robin`;
- immediate `PUT /config { accountMode }`.

Model routes:

- per-account multi-select from catalog;
- stored as `modelRoutes: { [modelId]: apiKeyEnv }`;
- remove route;
- fallback на обычную ротацию, если аккаунт в cooldown.

Состояния:

- нет ключей — empty state с CTA;
- key invalid — red dot + verify action;
- quota exhausted — warning;
- partial cleanup — retry action.

### 5.4 Models & context

- Sync button: `POST /models/sync`.
- Plan badge: `Verified` / `Fallback`.
- Plan filter toggle.
- Visible models: searchable multi-select, `All`, `Plan only`, `Clean stale`.
- Model table:
  - enabled checkbox;
  - name + badges (`Recommended`, `New`, `Custom`, `Vision`, `Reasoning`, `In plan`);
  - id;
  - context/maxTokens with edit popover;
  - reasoning effort select;
  - TTFT probe button.
- Global context field: `32K`/`1M` shorthand, decimal units (`K=1000`, `M=1000000`).
- Per-model overrides: add row, model select, value, remove.
- Output limit: empty = derived; `0` = omit `max_tokens`; positive = cap.
- Custom models form.
- Narrow screens: table → cards.

### 5.5 Usage & analytics

- 5h/weekly/monthly progress bars with reset countdown.
- Warning banners at 80% and 95%.
- Session tiles: requests, tokens, reasoning, cost (`≈`), last latency.
- `Open analytics` button.
- `Export CSV`.
- `Reset stats` with confirm.

### 5.6 Integrations

- Web search toggle (`webSearch`).
- Sidebar quota toggle (`showSidebarQuota`).
- Composer cost toggle (`showComposerCost`).
- Legacy proxy mode toggle only when `transport === 'pi-ai'`; в adapter-режиме скрыт.

### 5.7 Diagnostics

- Smoke test with latency/preview.
- Register/unregister adapter (для adapter-режима: re-register).
- Update banner/status.
- Health: host, key, provider route, last error.

### 5.8 Advanced

- baseUrl (https or localhost).
- timeoutMs, smokeTimeoutMs, streamIdleTimeoutMs.
- statsPath, modelsCachePath.
- maxPayloadMb.
- price overrides.
- transport selector (temporary).
- reset to defaults.

### 5.9 Models page card

Компонент `ProviderCard`:

- key status badge;
- paste key field show/hide;
- save to credentials via `POST /save-key`;
- verify;
- link to full settings section;
- model count;
- route active badge.

Поведение:

- регистрируется только для `entryKey === 'dsh-clinebot'`;
- для чужих провайдеров `return null`;
- не перекрывает официальный editor;
- при отсутствии `settings.models.provider-card` регистрация молча не происходит.

### 5.10 Sidebar и dashboard

Sidebar:

- wide: ring + plan + 5h bar + percent;
- rail: 20px ring;
- click → modal `DashboardDialog`;
- polling 60s only when visible and `document.visibilityState === 'visible'`;
- hidden → no polling.

Dashboard modal:

- tabs `Quota` / `Analytics`;
- per-account tabs;
- plan/email;
- 5h/weekly/monthly;
- reset countdown;
- rotation mode + pinned account;
- refresh;
- close.

Analytics:

- range 7/30/90/custom;
- totals: requests, tokens, cost, success rate, avg TTFT, avg latency;
- groups: by day/model/account/session;
- top sessions;
- CSV export;
- `unpriced` badge where cost unavailable;
- fork/inherited usage не учитывать (в DSH нет отдельного источника; считать только запросы через `clinebot`).

### 5.11 Composer cost

- Использовать `useProjection('tokenUsage')` и `useProjection('modelSelection')`, если доступны.
- Иначе — `/stats` fallback.
- Стоимость считать по `lib/model-prices.js`:
  - input/output/cacheRead/cacheWrite/reasoning;
  - `≈` перед суммой;
  - `unpriced`, если цены нет;
  - breakdown popover;
  - не показывать фейковые `$0.15/$3`.
- Не дублировать учёт: adapter пишет usage один раз.

### 5.12 Slash command

Сохранить `/cline`:

- `quota` (default)
- `models`
- `accounts`
- `switch <KEY>`
- `rotate`
- `ping [model]`
- `test [model]`
- `stats`
- `analytics [7d|30d]`
- `price <model>`

Требования:

- plain text, без markdown;
- первая строка ≤ 120 символов;
- `CommandResult { kind: 'success', text }`;
- ошибки — `kind: 'error'`.

---

## 6. Аналитика и стоимость

### 6.1 Хранилище

`lib/stats-storage.js`, версия 2:

```js
{
  version: 2,
  createdAt, updatedAt,
  totals: {
    requests, successful, failed, rateLimited429,
    promptTokens, completionTokens, reasoningTokens,
    cacheReadTokens, cacheWriteTokens, totalTokens,
    costUsd, pricedRequests, unpricedRequests,
    ttftMsSum, latencyMsSum
  },
  byDay: { 'YYYY-MM-DD': bucket },
  byMonth: { 'YYYY-MM': bucket },
  byModel: { [model]: bucket },
  byAccount: { [account]: bucket },
  bySession: { [sessionId]: sessionBucket }
}
```

`bucket`:

```js
{
  requests, successful, failed, rateLimited429,
  promptTokens, completionTokens, reasoningTokens,
  cacheReadTokens, cacheWriteTokens, totalTokens,
  costUsd, pricedRequests, unpricedRequests,
  ttftMsSum, latencyMsSum,
  firstAt, lastAt
}
```

Ограничения:

- `bySession` — максимум 500 сессий;
- хранить 90 дней;
- `byDay` — 365 дней;
- pruning при записи;
- corrupted file → `*.corrupt.<ts>`, максимум 3 копии.

### 6.2 Запись

`recordUsage` расширить:

```js
{
  sessionId, accountId, model, purpose,
  promptTokens, completionTokens, reasoningTokens,
  cacheReadTokens, cacheWriteTokens, totalTokens,
  costUsd, priced,
  ttftMs, latencyMs,
  isError, is429,
  statsPath
}
```

Источник — только adapter (не proxy, не `llm/stream`).

### 6.3 API

`GET /dsh-clinebot/analytics?from&to&groupBy&limit&model&account`

- `from`/`to` — ISO или epoch ms;
- `groupBy` — `session|day|model|account`;
- `limit` — default 50, max 500;
- ответ:
  ```json
  {
    "ok": true,
    "range": { "from": "...", "to": "..." },
    "totals": { "...": 0 },
    "groups": [
      { "key": "...", "label": "...", "requests": 0, "tokens": 0, "costUsd": 0, "successRate": 0, "avgTtftMs": 0, "avgLatencyMs": 0 }
    ],
    "unpriced": 0
  }
  ```
- `GET /dsh-clinebot/stats/export` расширить колонками `costUsd`, `ttftMs`, `latencyMs`, `sessionId` (обратная совместимость: старые колонки остаются).

### 6.4 Цены

`lib/model-prices.js`:

- `PRICE_TABLE_VERSION`;
- `MODEL_PRICES` — USD за 1M токенов: input/output/cacheRead/cacheWrite;
- `priceOverrides` в конфиге;
- `estimateCost({ model, prompt, completion, reasoning, cacheRead, cacheWrite })` → `{ usd, priced, breakdown }`;
- ClinePass — подписка, поэтому:
  - цены **не выдаются за официальные**;
  - UI показывает `≈`;
  - неизвестная модель → `unpriced`, не `$0`;
  - пользователь может задать свои ставки в Advanced;
  - в README явно указать источник/природу оценок.

---

## 7. TUI

Добавить `applyCommandCodeTuiSettings` по контракту `tuiSettingsSections` (структурные типы, без жёсткой зависимости).

Секция:

- `ns: 'dsh-clinebot'`
- `title: 'ClineBot'`
- groups: `Connection`, `Models`, `Advanced`

Поля:

| Path | Kind | Назначение |
|---|---|---|
| `apiKey` | text secret `{ ref: apiKeyEnv }` | ключ в credentials, не в settings |
| `apiKeyEnv` | text | credential ref |
| `baseUrl` | text | API base |
| `filterModelsByPlan` | boolean | скрыть out-of-plan |
| `webSearch` | boolean | web search |
| `proxyMode` | boolean | только для `pi-ai` |
| `activeAccount` | text + options (`auto` + accounts) | пин аккаунта |
| `modelVisibility.<id>` | boolean per model | чекбоксы моделей |
| `contextWindow` | number | глобальный контекст |
| `maxOutputTokens` | number | output cap, `0` = omit |

Требования:

- `modelVisibility` — **один path на модель** (`modelVisibility.<id>`), иначе TUI склеит draft всех чекбоксов в один path.
- `activeAccount` — `text` + `options`, не `select`, чтобы `auto`/unset был достижим.
- Секция перерегистрируется при изменении `apiKeyEnv`, списка аккаунтов, набора unknown model ids.
- Отсутствие `tuiSettingsSections` — не ошибка, TUI-секция просто не появляется.
- Ключ пишется только через credentials seam.

---

## 8. Управление состоянием клиента

Новые модули:

- `src/client/store.js` — `createSnapshotStore`, `createController`.
- `src/client/settings-controller.js` — draft/dirty/invalid/saving/saveResult/discard.
- `src/client/usage-controller.js` — единый polling `/accounts/usage` + `/usage`.
- `src/client/status-controller.js` — `/status` без дублей.
- `src/client/analytics-controller.js` — `/analytics`.

Правила:

- Один источник правды для server-state: HTTP snapshot.
- Компоненты не делают fetch напрямую; только через контроллеры.
- Один poll на приложение; интервал 60s; пауза при `document.hidden`.
- `AbortController` на unmount.
- Оптимистичные обновления только для toggle-моделей; rollback при ошибке.
- SaveBar работает с draft; аккаунты — immediate.
- Ошибки не глотать: показывать в UI с retry.

---

## 9. API

### 9.1 Существующие endpoints

Сохраняются без breaking changes:

- `GET /dsh-clinebot/status`
- `GET/PUT /dsh-clinebot/config`
- `POST /dsh-clinebot/save-key`
- `POST /dsh-clinebot/key/verify`
- `GET /dsh-clinebot/usage`
- `POST /dsh-clinebot/models/sync`
- `POST /dsh-clinebot/models/toggle`
- `POST /dsh-clinebot/models/context`
- `POST /dsh-clinebot/models/visible`
- `POST /dsh-clinebot/models/probe`
- `POST /dsh-clinebot/accounts`
- `POST /dsh-clinebot/accounts/delete`
- `POST /dsh-clinebot/accounts/active`
- `GET /dsh-clinebot/keys/discovered`
- `POST /dsh-clinebot/keys/discovered/import`
- `POST /dsh-clinebot/smoke`
- `POST /dsh-clinebot/register`
- `POST /dsh-clinebot/unregister`
- `GET /dsh-clinebot/stats`
- `POST /dsh-clinebot/stats/reset`
- `GET /dsh-clinebot/stats/export`
- `POST /dsh-clinebot/update`

### 9.2 Новые endpoints

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/dsh-clinebot/accounts/rename` | Переименовать аккаунт |
| `POST` | `/dsh-clinebot/accounts/key/clear` | Удалить ключ, оставить аккаунт |
| `GET` | `/dsh-clinebot/accounts/usage` | Квоты всех аккаунтов (без секретов) |
| `GET` | `/dsh-clinebot/analytics` | Аналитика по сессиям/дням/моделям/аккаунтам |
| `GET` | `/dsh-clinebot/prices` | Таблица оценок стоимости |
| `GET` | `/dsh-clinebot/adapter/status` | Состояние adapter registration |

#### `POST /accounts/rename`

```json
{ "apiKeyEnv": "CLINEBOT_API_KEY_2", "label": "Team" }
```

- `apiKeyEnv` — regex `^CLINEBOT_API_KEY(_[A-Z0-9]+)?$`;
- аккаунт должен существовать в pool;
- primary переименовать нельзя (400);
- ответ `{ ok: true, accounts: [...] }`.

#### `POST /accounts/key/clear`

```json
{ "apiKeyEnv": "CLINEBOT_API_KEY_2" }
```

- удаляет credential, аккаунт остаётся в pool;
- primary разрешён с confirm в UI;
- ответ `{ ok: true, apiKeyEnv, cleared: true }`.

#### `GET /accounts/usage`

- доверенный запрос;
- параллельно `fetchUsageLimits` по каждому аккаунту, timeout ≤ 2500ms;
- `Promise.allSettled`;
- ответ:
  ```json
  {
    "ok": true,
    "activeAccount": "CLINEBOT_API_KEY",
    "accountMode": "least_used",
    "checkedAt": 0,
    "accounts": [
      {
        "id": "default",
        "label": "Default",
        "apiKeyEnv": "CLINEBOT_API_KEY",
        "configured": true,
        "source": "credentials",
        "active": true,
        "isPinned": false,
        "usage": { "plan": "...", "user": { "email": "..." }, "windows": { "...": {} } },
        "error": null
      }
    ]
  }
  ```
- секреты никогда не возвращаются;
- кэш SWR на 20–60s.

#### `GET /analytics`

См. раздел 6.3.

#### `GET /prices`

```json
{
  "ok": true,
  "version": 1,
  "updatedAt": "...",
  "currency": "USD",
  "models": [
    { "id": "...", "input": 0.15, "output": 0.6, "cacheRead": 0.003, "cacheWrite": null }
  ]
}
```

### 9.3 Ошибки

Единый конверт:

```json
{ "ok": false, "error": "human readable", "code": "STABLE_CODE" }
```

Коды:

- `BAD_REQUEST`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `SERVICE_UNAVAILABLE`
- `UPSTREAM_ERROR`
- `TIMEOUT`
- `UNPRICED_MODEL`
- `ADAPTER_NOT_REGISTERED`

---

## 10. Конфигурация

### 10.1 Новые поля

| Поле | Тип | Default | Назначение |
|---|---|---|---|
| `transport` | `'adapter' \| 'pi-ai'` | `'adapter'` | Временный выбор транспорта |
| `contextWindow` | number | `0` (unset) | Глобальный context override |
| `maxOutputTokens` | number | `0` (derived) | `0` = omit `max_tokens`; >0 = cap |
| `priceOverrides` | dict | `{}` | Пользовательские ставки |
| `showComposerCost` | boolean | `true` | Показывать стоимость в composer |
| `legacyMigratedAt` | number | `0` | Внутренняя метка миграции (non-volatile) |

### 10.2 Deprecated

- `proxyMode` — читается только при `transport === 'pi-ai'`; в UI скрыт в adapter-режиме; удаление в `0.7.0`.
- `enabledModels` — уже rejected на `PUT /config`.

### 10.3 Совместимость

- Старые конфиги читаются без ошибок.
- `modelContextOverrides` с `modelId: '*'` мигрирует в `contextWindow`, если `contextWindow` не задан.
- `stats` v1 автоматически апгрейдится в v2.
- `dynamicModels`, `planSyncedAt`, `accounts`, `activeAccount`, `accountMode`, `modelRoutes`, `visibleModels`, `disabledModels`, `modelReasoningDefaults`, `customModels` сохраняются.

---

## 11. Безопасность

- Все management endpoints — `assertTrustedSettingsRequest`.
- Proxy endpoints `/v1/*` удаляются вместе с прокси (или остаются только как отдельный opt-in gateway с loopback-only).
- Ключи только в credentials store; не в settings, не в GET-ответах, не в логах.
- `apiKeyEnv` — строгий regex.
- `baseUrl` — https или localhost.
- Новые endpoints не возвращают секреты.
- Analytics не содержит ключей/URL с токенами.
- `priceOverrides` — не секреты.
- TUI secret field пишет только через credentials seam.
- `llm/stream`-хук удаляется; adapter не логирует тело запроса.

---

## 12. Производительность

- Один adapter на провайдера; без промежуточного HTTP.
- `listModels` мемоизируется; инвалидация по настройкам/плану.
- `resolveModel` — синхронный по каталогу, без сети.
- Один polling loop на клиент.
- `sidebar` polling только при видимости.
- `fetchWithTimeout` для всех клиентских запросов.
- `AbortController` на unmount.
- Кэш `usage` SWR.
- Streaming не буферизует больше первого чанка (кроме pre-token failover).
- `maxPayloadMb` применяется до отправки.

---

## 13. Локализация, доступность, визуальный язык

- Все строки через `t()`; никаких литералов в JSX-подобном коде.
- en + zh обязательны; ru — внешний `dsh-russian-lang`.
- Убрать `'原厂'`, английские заголовки таблиц, emoji-иконки.
- SVG-иконки в `src/client/icons.js`.
- Использовать примитивы DSH: `Button`, `Menu`, `Modal`, `Switch`.
- CSS-классы вместо inline-стилей; токены `--dsw-alias-*`.
- `color-mix` вместо hardcoded rgba.
- Light/dark темы.
- Responsive: wide/rail sidebar, narrow settings.
- A11y: `aria-label`, `aria-expanded`, `role`, keyboard, focus trap.
- ErrorBoundary на каждом слоте.

---

## 14. Тестирование и приёмка

### 14.1 Unit / contract

- `adapter.test.js`:
  - `providerInfo`, `listModels`, `resolveModel`, `prepareCall`;
  - маппинг сообщений;
  - маппинг чанков;
  - usage (cache/reasoning);
  - finish reasons;
  - abort;
  - ошибки/коды.
- `adapter-failover.test.js`:
  - 429/402/5xx/401 pre-first-token;
  - cooldown;
  - next account;
  - no mid-stream retry.
- `adapter-images.test.js`:
  - image block;
  - offloaded placeholder;
  - text-only rejection;
  - image target.
- `analytics.test.js`:
  - aggregation;
  - pruning;
  - v1→v2 migration;
  - unpriced.
- `prices.test.js`:
  - overrides;
  - unpriced;
  - breakdown.
- `ui-controller.test.js`:
  - dirty/discard/save;
  - validation;
  - polling pause.
- `locales.test.js`:
  - 100% key coverage;
  - no hardcoded Chinese/English.
- `adapter-registration.test.js`:
  - `registerAdapter` called with `clinebot`;
  - `registerConfigurableProviders` with `settingsNs: 'dsh-clinebot'`;
  - no `llm-pi-ai` mutation in adapter mode;
  - legacy migration.

### 14.2 Golden parity

Записать реальные SSE-фикстуры ClinePass:

- text;
- reasoning;
- tool calls;
- multi-turn tool result;
- usage with cache;
- 429;
- early error in 200;
- abort.

Прогнать через старый прокси и новый adapter; сравнить:

- последовательность блоков;
- текст/reasoning;
- tool calls;
- usage;
- finish reason.

### 14.3 Manual matrix

- DSH 0.2.1-rc.2.
- Web, desktop, headless.
- Light/dark.
- en/zh (+ ru external).
- no key / invalid key / exhausted quota.
- 1 account / 3 accounts / pinned / round-robin.
- vision model / text-only.
- reasoning model.
- TUI profile.
- Models page card.
- Update flow.

### 14.4 Definition of Done

- `npm test` green.
- `npm run typecheck` green.
- `npm run build:client -- --check` green.
- `lib/client.js` ≤ 256 KiB.
- Server modules ≤ 600 lines; client ≤ 500.
- No `llm-pi-ai.providers.clinebot` in adapter mode.
- No loopback proxy in adapter mode.
- `ctx.llm.listProviders()` contains `clinebot`.
- `ctx.llm.listConfigurableProviders()` contains `clinebot`.
- Models card visible only for ClineBot.
- README/DESIGN/TZ/CHANGELOG updated.
- Isolated install test on 0.2.1-rc.2.

---

## 15. Этапы

### Phase 0 — фиксация движка

- `engines.dsh: "0.2.1-rc.2"`.
- `dsh.compatibility` records.
- Peer deps: `@deepseek-ai/dsh-llm`, `dsh-attachment`, `dsh-credentials`, `dsh-settings`, `dsh-commands`, `dsh-web`, `cordis ~4.0.5`.
- Удалить 0.1.7 из документации.
- CI: install/engine/typecheck.

### Phase 1 — транспорт

- Вынести `cline-transport.js` из `routes/proxy.js`.
- SSE parser, request builder, timeout, abort, retry.
- Golden-фикстуры.
- Поведение не меняется.

### Phase 2 — adapter core

- `ClineBotAdapter`, `adapter-messages.js`, `adapter-stream.js`.
- text/reasoning/tool calls/usage/finish/abort.
- Multi-account failover.
- Feature flag `transport`.
- Регистрация adapter + configurable provider.
- Тесты.

### Phase 3 — images, replay, migration

- `ImageBlock` + attachments.
- `imageRequestTarget`.
- Reasoning replay.
- Legacy migration from `llm-pi-ai`.
- Models page card.
- Adapter status endpoint.
- `/cline` обновление.

### Phase 4 — UI redesign

- Группы настроек.
- SaveBar.
- Accounts rows.
- Models section.
- Usage/analytics.
- Sidebar/dashboard.
- Composer cost.
- Локализация/иконки/CSS.

### Phase 5 — analytics, prices, TUI

- stats v2.
- `/analytics`.
- `/prices`.
- CSV.
- TUI section.
- Docs/screenshots.

### Phase 6 — cleanup

- Удалить proxy/pi-ai path.
- Удалить `proxyMode`.
- Major release `0.6.0`.
- Обновить README/DESIGN/CHANGELOG.

---

## 16. Критерии приёмки по фазам

### Phase 2

- Streaming text/reasoning/tool calls совпадает с golden.
- Usage корректен (cache/reasoning).
- 429 failover до первого токена.
- Abort работает.
- `listModels`/`resolveModel` возвращают корректные данные.
- `transport: 'adapter'` не пишет в `llm-pi-ai`.

### Phase 3

- Images работают на vision-моделях.
- Text-only модель отклоняет images.
- Reasoning replay сохраняет tool loop.
- Legacy provider удалён.
- Models card появляется только у ClineBot.

### Phase 4

- Все настройки сохраняются одной кнопкой.
- Discard работает.
- Ошибки не теряют draft.
- Аккаунты: pin/unpin, rename, clear key, delete, add, discovered import.
- Модели: plan filter, allowlist, context/output, reasoning, probe.
- Dashboard/sidebar/composer.
- Нет inline-стилей/эмодзи в новом коде.
- en/zh полные.

### Phase 5

- Analytics по сессиям/дням/моделям/аккаунтам.
- Cost `≈`/`unpriced`.
- CSV.
- TUI: ключ, модели, active account.

### Phase 6

- `llm-pi-ai.providers.clinebot` отсутствует.
- Loopback proxy не стартует.
- `proxyMode` удалён.
- Все тесты зелёные.
- Изолированная установка на 0.2.1-rc.2.

---

## 17. Риски и смягчение

| Риск | Вероятность | Смягчение |
|---|---|---|
| Ошибка маппинга tool calls | Высокая | Golden-фикстуры, тесты tool-loop |
| Reasoning replay ломает DeepSeek/GLM | Средняя | Отдельные тесты, fallback на текст |
| Images/attachments API отличается | Средняя | `resolveAttachments` по образцу `dsh-llm-deepseek`, тесты |
| DSH rc-API меняется | Средняя | Pin `0.2.1-rc.2`, engine test, без альф |
| Потеря legacy-пользователей | Средняя | `transport: 'pi-ai'` на один релиз, миграция |
| Двойной retry (adapter + dsh-llm-retry) | Средняя | `maxRetries: 1`, внутренний failover |
| ClinePass не отдаёт цены | Высокая | `≈`, `unpriced`, priceOverrides |
| Внешние клиенты используют `/v1` | Средняя | Оставить optional gateway или документировать удаление |
| Bundle > 256 KiB | Средняя | Декомпозиция, `--check`, budget |

---

## 18. Карта файлов

### 18.1 Новые

```
lib/adapter.js
lib/adapter-messages.js
lib/adapter-stream.js
lib/adapter-errors.js
lib/transport/cline-transport.js
lib/model-prices.js
lib/analytics.js
lib/routes/analytics.js
lib/tui-settings.js
src/client/store.js
src/client/settings-controller.js
src/client/usage-controller.js
src/client/status-controller.js
src/client/analytics-controller.js
src/client/icons.js
src/client/components/provider-card.js
src/client/components/analytics-panel.js
src/client/components/settings-group.js
src/client/components/save-bar.js
docs/design/ANALYTICS.md
```

### 18.2 Изменяемые

```
lib/index.js
lib/config.js
lib/models.js
lib/cline-client.js
lib/account-pool.js
lib/session-router.js
lib/stats-storage.js
lib/telemetry.js
lib/provider-sync.js
lib/routes/settings.js
lib/routes/accounts.js
lib/routes/models.js
lib/routes/auth.js
lib/slash-command.js
lib/web-search.js
src/client/entry.js
src/client/settings-page.js
src/client/styles.js
src/client/locales.js
src/client/components/*.js
scripts/build-client.js
package.json
README.md
README.ru.md
README.zh.md
CHANGELOG.md
docs/design/DESIGN.md
test/*.test.js
```

### 18.3 Удаляемые после Phase 6

```
lib/proxy-server.js
lib/proxy-token.js
lib/routes/proxy.js
```

`lib/provider-sync.js` не удаляется целиком: остаются `buildStatus`, `resolveActiveAccountKey`, `formatProgressBar`, `resolvePathWithHome`; удаляются `upsertPiAiProvider`, `removePiAiProvider` и pi-ai-специфичная часть `autoDiscoverPlanModels`.

---

## 19. Приложение A: скелет адаптера

```js
import { LlmAdapter, LlmError, ToolCallId, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { publicConfig } from './config.js'
import { getAllModels, findModel, formatModelDescription } from './models.js'
import { resolveAccountPool } from './account-pool.js'
import { resolveSessionAccount, markAccountCooldown } from './session-router.js'
import { recordUsage, recordSessionRequest } from './stats-storage.js'
import { buildOpenAiMessages } from './adapter-messages.js'
import { streamOpenAiChunks } from './adapter-stream.js'
import { requestCompletion } from './transport/cline-transport.js'

export class ClineBotAdapter extends LlmAdapter {
  constructor({ live, getSettingsApi, resolveAttachments, logger }) {
    super()
    this.live = live
    this.getSettingsApi = getSettingsApi
    this.resolveAttachments = resolveAttachments
    this.logger = logger
  }

  providerInfo(provider) {
    return { id: provider, name: 'ClineBot (ClinePass)' }
  }

  providerRetryPolicy() {
    return {
      mode: 'normal',
      maxRetries: 1,
      retryableCodes: ['RATE_LIMIT', 'TRANSPORT_ERROR', 'PROVIDER_ERROR'],
      backoff: { initialDelayMs: 500, maxDelayMs: 5000, jitterRatio: 0.1 },
    }
  }

  async listModels(provider) {
    const pub = publicConfig(this.live())
    return getAllModels(pub.dynamicModels, pub.modelContextOverrides, pub.customModels)
      .filter(m => !pub.disabledModels.includes(m.id))
      .filter(m => !pub.visibleModels.length || pub.visibleModels.includes(m.id))
      .filter(m => !pub.filterModelsByPlan || m.inPlan)
      .map(m => ({
        provider,
        id: m.id,
        name: m.name,
        description: formatModelDescription(m),
        inputModalities: m.input?.includes('image') ? ['text', 'image'] : ['text'],
      }))
  }

  async resolveModel(provider, model) {
    const pub = publicConfig(this.live())
    const m = findModel(model, pub.dynamicModels, pub.modelContextOverrides, pub.customModels)
    if (!m) throw new LlmError(`Unknown model "${model}"`, 'UNKNOWN_MODEL')
    const efforts = Array.isArray(m.reasoningEfforts) ? m.reasoningEfforts : []
    return {
      provider,
      id: m.id,
      name: m.name,
      description: formatModelDescription(m),
      inputModalities: m.input?.includes('image') ? ['text', 'image'] : ['text'],
      context: { contextWindow: m.contextLength },
      defaultMaxTokens: m.maxTokens,
      ...(efforts.length ? {
        reasoning: {
          efforts: efforts.map(id => ({ id: ReasoningEffortId(id), name: id })),
          defaultEffort: pub.modelReasoningDefaults[m.id]
            ? ReasoningEffortId(pub.modelReasoningDefaults[m.id])
            : undefined,
        },
      } : {}),
    }
  }

  async prepareCall(provider, model, signal) {
    const cfg = this.live()
    const info = await this.resolveModelFromConfig(cfg, provider, model)
    return { model: info, stream: options => this.streamWithConfig(options, cfg) }
  }

  stream(options) {
    return this.streamWithConfig(options, this.live())
  }

  async *streamWithConfig(options, cfg) {
    // 1. pool/session account
    // 2. body = buildOpenAiMessages(options, cfg, this.resolveAttachments)
    // 3. pre-first-token failover loop
    // 4. yield* streamOpenAiChunks(...)
    // 5. recordUsage / recordSessionRequest
  }
}
```

---

## 20. Приложение B: таблица finish/usage

| ClinePass | DSH |
|---|---|
| `finish_reason: 'stop'` | `{ kind: 'stop' }` |
| `finish_reason: 'tool_calls'` | `{ kind: 'tool-calls' }` |
| `finish_reason: 'length'` | `{ kind: 'max-tokens' }` |
| abort | `{ kind: 'aborted', failure }` |
| error | `{ kind: 'error', failure }` |
| `usage.prompt_tokens` | `inputTokens + cacheReadTokens + cacheWriteTokens` |
| `usage.prompt_tokens_details.cached_tokens` | `cacheReadTokens` |
| `usage.completion_tokens` | `outputTokens` |
| `usage.completion_tokens_details.reasoning_tokens` | `reasoningTokens` |
| `usage.total_tokens` | `totalTokens` |

---

## 21. Приложение C: чек-лист реализации

### Host

- [ ] `engines.dsh` = `0.2.1-rc.2`
- [ ] peer deps обновлены
- [ ] `ClineBotAdapter` зарегистрирован
- [ ] `registerConfigurableProviders` с `settingsNs: 'dsh-clinebot'`
- [ ] `listModels` / `resolveModel` / `prepareCall`
- [ ] `stream` text/reasoning/tool calls
- [ ] usage/cache/reasoning
- [ ] failover до первого токена
- [ ] abort
- [ ] images
- [ ] reasoning replay
- [ ] legacy migration
- [ ] no `llm-pi-ai` mutation
- [ ] no loopback proxy

### Client

- [ ] группы настроек
- [ ] SaveBar
- [ ] Accounts rows
- [ ] Models section
- [ ] Usage/analytics
- [ ] provider card
- [ ] sidebar/dashboard
- [ ] composer cost
- [ ] локализация
- [ ] иконки/CSS
- [ ] a11y
- [ ] ErrorBoundary

### Tests

- [ ] adapter unit
- [ ] golden parity
- [ ] failover
- [ ] images
- [ ] analytics
- [ ] prices
- [ ] controllers
- [ ] locales
- [ ] registration/migration
- [ ] decomposition
- [ ] build `--check`
- [ ] isolated install
