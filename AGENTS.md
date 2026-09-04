# dsh-clinebot: project facts

Дополняет корневой DEV/AGENTS.md. Пакет @goodandready/dsh-clinebot; канонический
репозиторий Gitea goodandready/dsh-clinebot. JavaScript ESM без сборки.

## Файлы
- lib/index.js — хост-половина: inject [settings, webServer, credentials], маршруты /api/plugins/dsh-clinebot/*.
- lib/cline-client.js — HTTP-клиент ClinePass (base URL, ключ, smoke, лимиты подписки); проверяется тестами без сети.
- lib/models.js — статический каталог моделей и пользовательские модели.
- lib/client.js — браузерная половина: window.__ModuleLoader__.load, карточка settings.plugin.item и раздел settings.section.
- cordis.patch.yml — вставка слоя плагина в профиль DSH.
- docs/design/DESIGN.md — дизайн-контракт UI.

## Совместимость с ядром (0.1.2-rc.1)
- dsh.client.inject в package.json может называть только модули, реально присутствующие в таблице клиентских модулей ядра (список id из загрузочной выдачи __DSH_BOOT__ боевого ядра).
- В rc.1 отсутствуют: @deepseek-ai/dsh-client-runtime, @deepseek-ai/dsh-client-ui-slots, @deepseek-ai/dsh-client-ui-primitives.
- ctx.slots в rc.1 встроенная служба ядра; модуль dsh-client-ui-slots не подключается и не заменяется.
- require ядерных клиентских модулей в lib/client.js допустим только с запасной веткой; для шеврона используется встроенный FallbackChevron.

## Constraints (MUST NOT)
- Не поднимать версию, не ставить теги и не публиковать в npm без явного ок владельца; production получает только опубликованную неизменяемую npm-версию.
- Любые force-режимы (git push --force, --force-with-lease, npm/pnpm/dsh --force, --no-verify) запрещены.
- Не менять дизайн-контракт docs/design/DESIGN.md без согласования владельца.

## Проверки
- npm test — node --test test/*.test.js; lint/typecheck/build скрипты в package.json отсутствуют.
- Совместимость с ядром: сверка dsh.client.inject с таблицей модулей загрузочной выдачи боевого ядра.

## Status
2026-09-04: клиентская совместимость с ядром 0.1.2-rc.1 исправлена и покрыта регрессионным тестом (issue #1). Проверка на боевом ожидает стабилизации dsh-web (рестарт-луп чужого плагина dshhub-market вне задачи) и ок владельца на deploy.
