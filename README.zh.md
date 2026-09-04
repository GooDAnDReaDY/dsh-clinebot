# 📦 @goodandready/dsh-clinebot

<div align="center">

<h3>适用于 DeepSeek Harness 的 ClineBot / ClinePass 原生模型提供商伴侣插件</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-clinebot"><img src="https://img.shields.io/npm/v/@goodandready/dsh-clinebot.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/GooDAnDReaDY/dsh-clinebot.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
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

</div>

---

## ⚡ 概述与解决的问题

**ClinePass** (`https://cline.bot`) 是一项固定月费（\$9.99/月）的高性价比订阅服务，为开发者提供主流开源代码模型与推理模型 2–5 倍的高并发调用限额，统一通过 OpenAI 兼容接口 (`https://api.cline.bot/api/v1`) 提供服务。

在将 ClinePass 接入 DeepSeek Harness (DSH) 时存在以下挑战：
1. **缺失 `/v1/models` 接口**：`api.cline.bot` 的 `GET /v1/models` 会直接返回 `404 Not Found`，导致动态模型同步失败。
2. **专属模型前缀**：所有模型 ID 均需前缀 `cline-pass/`（如 `cline-pass/deepseek-v4-flash`, `cline-pass/kimi-k3`）。
3. **安全凭据隔离**：禁止在明文配置中直接填写密钥。

**`@goodandready/dsh-clinebot`** 完美解决以上痛点：
* 🎯 内置包含全部 11 款官方 ClinePass 模型的静态精选目录。
* 🔐 深度集成 DSH `credentials` 服务 (`~/.dsh/.credentials.yaml`)，凭据隔离无泄漏。
* 🔄 一键写入 DSH `llm-pi-ai` 模型注册表。
* 🩺 设置面板内置毫秒级延迟探测与 Smoke Test 测试生成。

---

## 📦 快速安装

在活动的 DeepSeek Harness 配置中安装：

```bash
dsh plugin --profile web add @goodandready/dsh-clinebot
```

---

## 🔑 凭据配置

在 DSH 凭据文件 (`~/.dsh/.credentials.yaml`) 中添加 ClinePass 密钥：

```yaml
CLINEBOT_API_KEY: "your-clinepass-api-key"
```

---

## 📄 许可证

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
