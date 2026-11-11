# index.md — dsh-clinebot

Краткая навигационная карта проекта. Только подтверждённые факты; подробности —
в `docs/` и Gitea.

- **Назначение**: плагин DeepSeek Harness: мульти-аккаунтный адаптер Cline/Roo-Code,
  маршрутизация моделей, ротация API-ключей, аналитика токенов/затрат, экспорт статистики в CSV
  и веб-поиск для DSH.
- **Пакет**: `@goodandready/dsh-clinebot`, версия в `package.json`.
- **Статус**: active. 251+ тестов, CI preflight PASS, бандл `lib/client.js` < 256 KiB.
- **DEV**: `/mnt/external/Project/DEV/dhsplugins/dsh-clinebot`.
- **OPT / production**: DSH web-профиль MiniAI (`192.168.1.111`), CLI
  `/home/vadim/.nvm/versions/node/v24.15.0/bin/dsh`.
- **Desktop профиль**: `C:\Users\vadim\.dsh\profiles\desktop`.
- **Gitea**: `goodandready/dsh-clinebot`, ветка `main`.
- **GitHub mirror**: `GooDAnDReaDY/dsh-clinebot`.

## Точки запуска

- Серверная половина: загружается ядром DSH/Cordis из `lib/index.js`.
- Клиентская половина: `lib/client.js` (собирается из `src/` скриптом `scripts/build-client.js`).
- Пользовательские поверхности:
  - Секция настроек в «Настройки → Плагины → Cline Bot».
  - Монитор квот и расходов в сайдбаре / футере.
  - LLM-адаптер Cline для чата и сессий DSH.

## Основные компоненты

- `lib/index.js` — точка входа Cordis: конфигурация, схемы, регистрация роутов и сервисов.
- `lib/adapter.js` — адаптер Cline для DSH LLM-сервиса (multimodal, stream, tool calls, failover).
- `lib/accounts.js` — управление аккаунтами, credentials и хранилищем ключей.
- `lib/routes/accounts.js` — HTTP REST API эндпоинты для аккаунтов и мутаций.
- `lib/routes/stats.js` — HTTP REST API эндпоинты статистики и экспорта CSV.
- `lib/transport/cline-transport.js` — HTTP транспорт, streaming SSE, обработка сетевых ошибок и таймаутов.
- `lib/stats-storage.js` — сохранение статистики использования, лимиты, retention и ротация.
- `lib/provider-sync.js` — синхронизация моделей провайдеров и каталога цен.
- `lib/models-cache.js` — дисковый кэш каталога моделей.
- `src/` — исходные модули фронтенда UI (Preact/JSX).
- `scripts/build-client.js` — сборщик клиентского бандла `lib/client.js`.
- `docs/design/DESIGN.md` — дизайн-контракт пользовательского интерфейса.

## Команды

| Проверка | Команда |
| --- | --- |
| Сборка клиента | `node scripts/build-client.js` |
| Unit-тесты | `npm test` |
| Preflight-проверка | `bash /home/vadim/.dsh/skills/dsh-plugin-preflight/scripts/preflight.sh .` |
| Проверка пакета | `npm pack --dry-run` |
| Подготовка релиза | `bash deploy.sh check` |

## Deploy

- Кандидат: проверка `bash deploy.sh check`.
- Production: после публикации установка registry-версии через
  `dsh plugin --profile web add @goodandready/dsh-clinebot@<version>`
  после явного подтверждения владельца.
- Проверка: `bash deploy.sh verify [version]`.
