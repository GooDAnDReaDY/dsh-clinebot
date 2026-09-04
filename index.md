# dsh-clinebot

@goodandready/dsh-clinebot — компаньон DeepSeek Harness для провайдера ClineBot/ClinePass: карточка настроек, лимиты подписки, каталог моделей, слэш-команда /cline.

- Источник: Gitea goodandready/dsh-clinebot. Публикация: npm @goodandready/dsh-clinebot после явного ок владельца.
- Контуры: тестовый — изолированный DSH test host (профиль web, 127.0.0.1:3082); боевой — production DSH web (профиль web).

| Проверка | Команда / критерий |
| --- | --- |
| Unit и клиентская загрузка | npm test |
| Совместимость с ядром | dsh.client.inject — подмножество таблицы модулей __DSH_BOOT__ боевого ядра |
| Build / lint / typecheck | отсутствуют в package.json (чистый ESM без сборки) |
| Установка в боевой | только опубликованная npm-версия через dsh plugin --profile web add после ок владельца |

См. README.md, AGENTS.md, docs/design/DESIGN.md.
