# 📦 @goodandready/dsh-clinebot

<div align="center">

<h3>适用于 DeepSeek Harness 的 ClineBot / ClinePass 原生模型提供商伴侣插件</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-clinebot"><img src="https://img.shields.io/npm/v/@goodandready/dsh-clinebot.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="../LICENSE"><img src="https://img.shields.io/github/license/GooDAnDReaDY/dsh-clinebot.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<!-- 作者所有项目展示页面链接 -->
<p align="center">
  <a href="https://goodandready.app/"><img src="https://img.shields.io/badge/作者所有开源项目-goodandready.app-ff4500.svg?style=for-the-badge&logo=rocket&logoColor=white&labelColor=1a1a2e" alt="所有项目"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

<table align="center">
  <tr>
    <td align="center">
      ⭐ <strong>如果您喜欢这个插件，请在 GitHub 上为它点亮 Star</strong> — 这能让我知道插件对您有用，并鼓励我继续开发和维护它。
      <br><br>
      🐛 <strong>如果您发现 Bug 或希望增加功能</strong>，请使用任意语言在 GitHub 上提交 Issue — 我会评估您的建议，并在后续版本中实现有价值的改进。
    </td>
  </tr>
</table>

</div>

---

## ⚡ 概述与解决的核心痛点

**ClinePass** (`https://cline.bot`) 是一项高性价比订阅服务，为开发者提供主流开源代码模型与推理模型 2–5 倍的高并发调用限额，统一通过 OpenAI 兼容接口 (`https://api.cline.bot/api/v1`) 提供服务。

在将 ClinePass 接入 DeepSeek Harness (DSH) 时存在以下挑战：
1. **缺失 `/v1/models` 接口**：`api.cline.bot` 的 `GET /v1/models` 会直接返回 `404 Not Found`，导致动态模型同步失败或模型列表为空。
2. **专属模型前缀**：所有模型 ID 均需前缀 `cline-pass/`（如 `cline-pass/deepseek-v4-flash`, `cline-pass/kimi-k3`）。
3. **用量额度监控**：5 小时滑动窗口与每周限额需要清晰直观的可视化进度监控。
4. **安全凭据隔离**：禁止在明文配置中直接填写密钥。

**`@goodandready/dsh-clinebot`** 完美解决以上痛点：
* 🚀 **应用内一键更新**：直接在 DSH 界面检查并升级插件，或通过受保护的 `/dsh-clinebot/update` 进行本地安全更新。
* ⚡ **SWR 配额与健康状态缓存**：状态查询毫秒级响应（<2ms），并在后台静默更新，不阻塞前端渲染。
* 🔀 **智能配额故障转移 (Smart Failover)**：在流式请求遇到 HTTP 429 或配额耗尽时自动轮换多账号（具备 30 秒防风暴保护；当前失败请求不自动重试，后续对话请求无缝使用下一个账号）。
* 🖥️ **插件配置页**：打开已安装的 ClineBot，进入配置。页面包含凭据名、模型、配额和账号，不单独占用侧边栏。
* 🔄 **订阅模型动态同步**：从官方 `GET /api/v1/users/me/plan` 自动提取真实包含模型，一键原子级同步至 DSH 提供商配置。DSH 严格仅注册当前套餐模型，内置目录作为特性参考并在未同步时作为备用。
* ⚠️ **额度耗尽实时预警**：当 5 小时滑动窗口达到 80%（警告黄色）和 95%（即将耗尽红色）时展示醒目预警横幅与重置倒计时。
* 📈 **会话统计与指标看板**：实时监控进程启动后经由 ClineBot 提供商发出的真实 DSH 对话请求、Prompt/Completion Token 消耗、流式延迟及错误统计。
* 📊 **实时用量仪表盘**：调用官方 `GET /users/me/plan/usage-limits` API，实时渲染 5 小时与每周额度进度条及重置倒计时。
* 🔑 **界面直存密钥**：在 UI 中直接粘贴 API 密钥，通过 `ctx.credentials.set()` 自动安全保存至 `~/.dsh/.credentials.yaml`。
* 🎯 **模型选择器管理**：支持勾选开启/关闭特定模型在聊天选择器中的显示。
* 💬 **聊天斜杠指令 `/cline`**：在任意聊天框快速查询当前配额、预警横幅、会话指标统计、网络延迟与活跃模型。

---

## 🏛️ 架构设计

```mermaid
graph LR
    subgraph UI [DSH Web 前端界面]
        Page["独立配置页 (设置 -> ClineBot)"]
        QuotaBar["5小时与每周额度进度条 + 额度预警横幅"]
        KeyInput["API 密钥直填与安全保存"]
        ModelPick["模型动态同步与选择器管控"]
        StatsCard["会话指标监控看板"]
    end

    subgraph PluginHost [dsh-clinebot 宿主运行环境]
        HttpEndpoints["API 路由: /dsh-clinebot/*"]
        ClientCore["lib/cline-client.js"]
        ModelCatalog["lib/models.js (内置精选 + 动态订阅解析)"]
        SlashCmd["斜杠指令: /cline"]
    end

    subgraph DSHCore [DSH 核心系统服务]
        Credentials["凭据存储服务 (~/.dsh/.credentials.yaml)"]
        PiAi["模型注册: llm-pi-ai.providers.clinebot"]
    end

    subgraph Upstream [Cline 官方云端]
        ClinePass["api.cline.bot/api/v1/chat/completions"]
        ClineQuota["api.cline.bot/api/v1/users/me/plan/usage-limits"]
        ClinePlan["api.cline.bot/api/v1/users/me/plan"]
    end

    Page -->|GET /status & /usage| HttpEndpoints
    KeyInput -->|POST /save-key| HttpEndpoints
    ModelPick -->|POST /models/sync| HttpEndpoints
    HttpEndpoints --> Credentials
    HttpEndpoints --> ClientCore
    ClientCore --> ModelCatalog
    HttpEndpoints -->|原子级写入| PiAi
    ClientCore -->|模型对话| ClinePass
    ClientCore -->|额度查询| ClineQuota
    ClientCore -->|套餐信息| ClinePlan
```

---

## ✨ 核心模块与功能

* **`lib/models.js`**：管理动态订阅模型目录与内置精选模板（提供完整的 `Off` / `Low` / `Medium` / `High` / `Max` 思考强度映射、上游 200k 上下文容量标注、自定义模型支持）以及套餐模型动态解析器（`parsePlanIncludedModels`, `getAllModels`, `getDynamicModels`）。
* **`lib/cline-client.js`**：
  * `fetchUsageLimits`：高效并发轮询 `GET /users/me/plan/usage-limits`、`GET /users/me/plan` 与 `GET /users/me` 并进行内存缓存。
  * `sessionStats` / `recordSessionRequest`：内存级会话度量记录器（请求次数、Token 估算、延迟、时间戳）。
  * `saveCredentialKey`：将密钥安全写入 `~/.dsh/.credentials.yaml`。
  * `smokeChat`：毫秒级网络探活与非流式延迟测试，并记录会话指标。
  * `buildPiAiProvider`：构建 DSH `llm-pi-ai` 兼容的服务商定义 (`api: 'openai-completions'`)。
* **`lib/index.js`**：Cordis 插件主生命周期服务，注册后端 REST API 路由（含 `/dsh-clinebot/models/sync`）、额度预警计算与 `/cline` 聊天斜杠指令。
* **`lib/client.js`**：插件行配置页（`plugins.row.config`），含预警横幅、会话指标、一键模型同步，以及后备插件卡片（`settings.plugin.item`）。没有 `settings.section` 侧边栏项。

---

## 📦 快速安装

在 DeepSeek Harness Web 配置中安装：

```bash
dsh plugin --profile web add @goodandready/dsh-clinebot
```

重启 DeepSeek Harness 实例并刷新浏览器页面。

---

## 💬 聊天斜杠指令 `/cline`

在任何聊天会话中输入 `/cline` 即可即时检查配额、预警状态与会话指标：

```text
### 🤖 ClinePass Status (ClinePass)
* 响应延迟: ✅ 210 ms
* 活跃密钥: CLINEBOT_API_KEY (credentials)
* 默认模型: `cline-pass/deepseek-v4-flash`

⏱ 5 小时窗口: [████░░░░░░] 42% (重置时间: 18:00)
📅 每周窗口:   [██████░░░░] 60% (重置时间: 09月08日)
* 绑定账号: `developer@example.com`

📈 当前会话统计:
* 请求次数: 14 次
* Token 估算: ~8,450 (Prompt: 6,100 | Completion: 2,350)
* 最近延迟: 210 ms
```

---

## ⚙️ 配置项参考 (DSH 设置与 Web UI)

在现代 DeepSeek Harness (0.1.7+) 中，各项配置通过 Web UI 或 `PUT /dsh-clinebot/config` 原生管理，密钥安全存储于 DSH Credentials 凭据中心 (`~/.dsh/.credentials.yaml`)。

```yaml
dsh-clinebot:
  enabled: true
  baseUrl: https://api.cline.bot/api/v1
  apiKeyEnv: CLINEBOT_API_KEY
  defaultModel: your-default-model
  proxyMode: true
  disabledModels: []
  customModels: []
  modelReasoningDefaults:
    your-reasoning-model: high
  modelContextOverrides: []
  statsPath: ~/.dsh/clinebot-stats.json
  timeoutMs: 30000
  smokeTimeoutMs: 60000
  streamIdleTimeoutMs: 60000
  accounts:
    - label: Team Key
      apiKeyEnv: CLINEBOT_API_KEY_2
```

### 配置参数说明

| 参数项 | 类型 | 默认值 | 说明 |
|:---|:---|:---|:---|
| `enabled` | `boolean` | `true` | 是否在 DSH 中启用 ClineBot 桥接插件 |
| `baseUrl` | `string` | `"https://api.cline.bot/api/v1"` | ClinePass OpenAI 兼容接口地址 |
| `apiKeyEnv` | `string` | `"CLINEBOT_API_KEY"` | 凭据管理系统中的密钥名称 |
| `defaultModel` | `string` | `"cline-pass/deepseek-v4-flash"` | 默认选中的模型 ID（用于对话及探活） |
| `disabledModels` | `array` | `[]` | 在选择器中隐藏的模型 ID 列表（新订阅模型默认自动启用） |
| `customModels` | `array` | `[]` | 用户自定义网关模型 (`[{ id, name, contextLength, maxTokens, category, isReasoning }]`) |
| `modelReasoningDefaults` | `object` | `{}` | 各模型默认思考强度配置 (`low`, `medium`, `high`, `max`) |
| `modelContextOverrides` | `array` | `[]` | 用户自定义模型上下文窗口与最大 Token 数量覆盖 |
| `proxyMode` | `boolean` | `true` | 启用透明本地环回代理以支持会话粘性路由与 429 自动故障转移 |
| `statsPath` | `string` | `"~/.dsh/clinebot-stats.json"` | 本地持久化 Token 用量统计文件路径 |
| `accounts` | `array` | `[]` | 额外轮转账号池 (`[{ label, apiKeyEnv }]`) |
| `activeAccount` | `string` | `""` | 手动指定的主账号（为空时自动按最低配额消耗优先路由） |
| `timeoutMs` | `number` | `15000` | HTTP 请求探测超时时间（毫秒） |
| `smokeTimeoutMs` | `number` | `25000` | 探活测试超时时间（毫秒） |
| `streamIdleTimeoutMs` | `number` | `30000` | SSE 流式输出块间空闲超时时间（毫秒） |
| `enabledModels` | `array` | *(已废弃)* | 仅在 public config 中只读提供，`PUT /config` 时禁止写入并请使用 `disabledModels` |
| `dynamicModels` | `array` | `[]` | 从官方套餐中自动同步的动态模型列表 |

---

## 🌐 HTTP API 接口说明

所有接口挂载于 `/dsh-clinebot/*` 路径，并受到跨站请求防护（仅放行同源或环回请求）。管理接口限制请求体上限 256 KiB；环回推理代理接口支持最高 64 MiB 有效载荷 (`MAX_PROXY_BODY_BYTES`)：

### 管理与控制接口（上限 256 KiB）
* `GET /dsh-clinebot/status` — 服务运行状态，包括健康探活、当前凭据名称、配额限制及会话统计。
* `GET /dsh-clinebot/config` — 诊断接口，安全获取脱敏后的公共配置（不含敏感密钥）。
* `PUT /dsh-clinebot/config` — 更新配置项（严格校验模式，已废弃的 `enabledModels` 被拦截）。
* `POST /dsh-clinebot/key/verify` — 实时验证 API 密钥有效性，返回绑定邮箱及套餐名称。
* `POST /dsh-clinebot/save-key` — 将 API 密钥安全写入 DSH 凭据服务。
* `POST /dsh-clinebot/models/sync` — 手动同步官方套餐动态模型列表。
* `POST /dsh-clinebot/models/toggle` — 批量切换模型可用性（更新 `disabledModels` 并保留 Volatile 引用）。
* `POST /dsh-clinebot/models/custom` / `DELETE /dsh-clinebot/models/custom` — 自定义模型增删。
* `POST /dsh-clinebot/models/context` / `DELETE /dsh-clinebot/models/context` — 上下文窗口与最大 Token 覆盖。
* `POST /dsh-clinebot/accounts` — 添加多账号备用凭据。
* `POST /dsh-clinebot/accounts/delete` — 删除账号（具备原子化凭据保护）。
* `POST /dsh-clinebot/accounts/active` — 指定活动账号（为空时自动启用最低用量优先路由）。
* `POST /dsh-clinebot/stats/reset` — 重置会话与 Token 消耗统计。
* `POST /dsh-clinebot/smoke` — 发起快速探测并返回实时延迟。
* `GET /dsh-clinebot/update/status` — 查询插件版本更新状态。
* `POST /dsh-clinebot/update/apply` — 应用版本更新（支持进程树完全清理与锁文件保护）。

### OpenAI 兼容环回代理接口（上限 64 MiB）
* `POST /dsh-clinebot/v1/chat/completions` — 本地透明代理，支持 SSE 流式与完整响应、会话粘性路由、最低用量负载均衡、响应体超时防护 (`streamIdleTimeoutMs`) 以及 429 自动故障转移。
* `GET /dsh-clinebot/v1/models` — 符合 OpenAI API 规范的模型列表。

> **DSH Desktop 2.x 与无界面环境**：环回代理在 `127.0.0.1` 绑定独立的专用 HTTP 服务（临时端口），彻底绕过桌面端路由防护 (`DesktopWebServer` 的 `x-dsh-desktop-renderer` 限制）。内置防护检测机制 (`detectHostWebServerFence`) 在环回端口受限时自动回退为直连模式，用户亦可在设置页的“诊断”模块中直接切换代理模式。

---

## 🧪 测试

运行自动化测试套件：

```bash
npm test
```

---

## 📄 许可证

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
