### 🤖 What is @goodandready/dsh-clinebot

Official companion plugin for DeepSeek Harness (DSH) connecting the **ClineBot (ClinePass)** model provider ($9.99/mo subscription) with dedicated management surfaces, live rate limits tracking, secure in-UI credential storage, and curated model catalogs.

---

### ✨ Key Features in v0.2.0

* **🖥️ Dedicated Settings Page**:
  - Standalone section in DSH Settings (`settings.section`, order 28) and compact card in Plugins list (`settings.plugin.item`).
* **📊 Live Quota & Usage Limits Dashboard**:
  - Tracks official rolling windows from `GET /users/me/plan/usage-limits`:
    - **5-Hour Rolling Limit**: visual progress bar with reset timestamp.
    - **Weekly Window Limit**: visual progress bar with remaining quota.
    - **Monthly Cycle**: renewal date and account email tracking.
* **🔑 Secure In-UI Key Storage**:
  - Enter API key directly in the web UI. Safely saved into DSH credentials service (`~/.dsh/.credentials.yaml`) with zero plaintext exposure in public settings.
* **🎛️ Model Picker Control**:
  - Granular selection of models exposed to DSH chat picker with filters (*All*, *Vision*, *Coding*, *Recommended*).
* **➕ Custom Models Manager**:
  - Add new ClinePass models (ID, name, context window, image/vision support) immediately without waiting for plugin updates.
* **💬 Slash-Command `/cline`**:
  - Run `/cline` in any DSH chat session for an instant quota summary and ping latency report.
* **📦 Curated Catalogue (11 Models)**:
  - DeepSeek V4 Flash & Pro, GLM 5.2, Kimi K3, Kimi K2.7 Code, Kimi K2.6, Qwen 3.7 Max & Plus, MiniMax M3, MiMo V2.5 & V2.5 Pro.

---

### 🧪 Verification & Quality Gate

* **Unit Tests**: 16/16 passing tests (`node --test test/*.test.js`).
* **Live Smoke Test**: Verified against `https://api.cline.bot/api/v1/chat/completions` (200 OK, latency: ~1.9s).
* **DSH Integration**: Tested and active on DSH v0.1.2-rc.1 / v0.1.3-alpha.1.

---

### 🚀 Installation

```bash
dsh plugin --profile web add @goodandready/dsh-clinebot
```
