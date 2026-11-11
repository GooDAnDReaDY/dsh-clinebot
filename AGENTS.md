# AGENTS.md — dsh-clinebot

Этот файл дополняет корневой `/mnt/external/Project/DEV/AGENTS.md` и содержит только
правила и факты, специфичные для плагина `dsh-clinebot`. При противоречии с корневыми
правилами агент останавливается и согласует действия с пользователем.

## Product / Purpose

- Проект: `dsh-clinebot` — плагин DeepSeek Harness: мульти-аккаунтный адаптер Cline/Roo-Code,
  маршрутизация моделей, ротация API-ключей, аналитика токенов/затрат и веб-поиск для DSH.
- DEV: `/mnt/external/Project/DEV/dhsplugins/dsh-clinebot`.
- OPT / production: DSH web-профиль на MiniAI (`192.168.1.111`), CLI `/home/vadim/.nvm/versions/node/v24.15.0/bin/dsh`, профиль `web`.
- Desktop профиль: `C:\Users\vadim\.dsh\profiles\desktop`.
- Основные пользователи: пользователи DSH, работающие с моделями через протокол Cline, пулы аккаунтов и мониторинг квот.
- Текущий статус: active, поддержка Cordis 4.1.0/4.x, мультимодальный адаптер, роутинг аккаунтов по модели.
- Gitea: `goodandready/dsh-clinebot`, ветка `main`.
- Публичный репозиторий: `GooDAnDReaDY/dsh-clinebot`.
- npm: `@goodandready/dsh-clinebot`.

## Project Index (`index.md`)

- `index.md` создан и проверен: да.
- Назначение: навигационная карта, архитектурное описание модулей, команды сборки/тестирования и контракты.

## Checks & Commands

| Проверка | Команда | Примечание |
| --- | --- | --- |
| Сборка клиента | `node scripts/build-client.js` | Бандл `lib/client.js` (< 256 KiB) |
| Тесты | `npm test` | Сборка клиента + 251+ unit/integration тестов |
| Preflight | `bash /home/vadim/.dsh/skills/dsh-plugin-preflight/scripts/preflight.sh .` | Проверка соглашений DSH |
| Pack check | `npm pack --dry-run` | Проверка состава файлов пакета |
| Deploy check | `bash deploy.sh check` | Комплексная проверка готовности к релизу |

## Delivery & Deployment

- Плагин устанавливается через `dsh plugin --profile web add @goodandready/dsh-clinebot@<version>`.
- Скрипт `deploy.sh` поддерживает режимы:
  - `check`: проверка тестов, размера бандла и упаковки кандидата.
  - `install <version>`: установка в web-профиль после явного одобрения.
  - `verify [version]`: верификация установленной версии и доступности web UI.
- `AGENTS.md`, `index.md`, `deploy.sh`, `scripts/` и `test/` не публикуются в npm и не зеркалируются на GitHub.

## Constraints

- Серверные модули (`lib/`) разбиты по доменам; размер каждого серверного файла не должен превышать 600 строк.
- Клиентский бандл (`lib/client.js`) собирается из `src/` скриптом `scripts/build-client.js` и строго ограничен лимитом DSH Store в 256 KiB.
- Не использовать `--force` при публикации или git-операциях.
- Не удалять и не сбрасывать конфигурацию аккаунтов и статистику на боевых профилях без явного указания владельца.
