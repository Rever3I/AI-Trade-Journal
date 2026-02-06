# Privacy Policy — AI Trade Journal

> Effective Date: 2026-02-06
> Last Updated: 2026-02-06

---

## 隐私政策 — AI Trade Journal (AI交易日志)

### 概述

AI Trade Journal（以下简称"本扩展"）是一款 Chrome 浏览器扩展程序，帮助用户将券商交易数据同步到 Notion 并提供 AI 驱动的交易分析。我们重视您的隐私，并承诺以透明的方式处理您的数据。

### 我们收集的数据

**用户主动提供的数据：**
- **交易数据：** 用户通过 Smart Paste 功能手动粘贴的交易记录文本（CSV、制表符分隔或自由文本格式）。我们仅在用户主动粘贴时接收此数据。
- **Notion OAuth 令牌：** 当用户授权连接 Notion 工作空间时，我们通过 OAuth 2.0 流程获取访问令牌。
- **许可证密钥：** 用户在激活产品时输入的 16 位激活码。

**自动收集的数据：**
- **使用指标：** AI 分析调用次数、输入/输出 token 数量（用于额度管理和成本控制）。按日期和许可证密钥汇总记录，不包含交易内容。

### 我们不收集的数据

- 浏览历史或浏览行为
- 个人身份信息（姓名、身份证号、手机号等）
- 金融账户登录凭证（券商账号密码）
- 设备指纹或追踪信息
- 通讯录或社交关系

### 数据如何被处理

1. **交易数据解析：** 用户粘贴的交易文本通过 Cloudflare Worker 安全代理转发至 Claude AI API 进行解析。解析后的结构化数据返回给用户在本地预览和确认。
2. **Notion 同步：** 用户确认后，结构化交易数据通过 Cloudflare Worker 代理发送至 Notion API，写入用户授权的 Notion 工作空间。
3. **AI 分析：** 用户触发分析请求时，结构化交易数据通过 Cloudflare Worker 代理发送至 Claude AI API 进行分析，分析结果返回给用户。

所有 API 通信均通过 HTTPS 加密传输，API 密钥存储在服务端，绝不暴露给客户端代码。

### 数据存储

| 数据类型 | 存储位置 | 保留期限 |
|---------|---------|---------|
| 交易数据（原始文本） | 浏览器本地 (chrome.storage) | 用户手动清除或卸载扩展时删除 |
| 解析后的交易数据 | 用户的 Notion 工作空间 | 由用户在 Notion 中自行管理 |
| Notion OAuth 令牌 | Cloudflare D1 数据库（服务端） | 用户取消授权时删除 |
| 许可证密钥状态 | Cloudflare D1 数据库（服务端） | 永久保留（用于许可证验证） |
| 使用指标（调用次数） | Cloudflare D1 数据库（服务端） | 90 天后自动清除 |
| AI 分析结果 | 浏览器本地 + 用户 Notion | 本地：用户手动清除；Notion：用户自行管理 |

### 数据共享

- **我们不会将用户数据出售给任何第三方。**
- 交易数据仅在以下必要场景中传输给第三方服务：
  - **Anthropic (Claude AI)：** 用于交易数据解析和分析。受 Anthropic 的数据使用政策约束。
  - **Notion：** 用于同步交易数据到用户工作空间。受 Notion 的隐私政策约束。
  - **Cloudflare：** 作为基础设施提供商处理 API 请求。受 Cloudflare 的隐私政策约束。
- 除上述必要的服务提供商外，我们不会与任何其他方共享用户数据。

### 用户权利

- **查看数据：** 您可以在 Notion 工作空间中查看所有同步的交易数据。
- **删除数据：** 您可以随时清除浏览器本地存储的数据（通过扩展设置或卸载扩展），并在 Notion 中删除交易记录。
- **撤销授权：** 您可以随时在 Notion 设置中撤销对本扩展的访问授权。
- **导出数据：** 您的所有交易数据存储在您自己的 Notion 工作空间中，可随时导出。

### 安全措施

- 所有网络通信使用 HTTPS/TLS 加密
- API 密钥（Anthropic、Notion）存储在服务端 Cloudflare Worker 中，不出现在客户端代码
- 扩展遵循最小权限原则，仅申请 `storage` 和 `sidePanel` 权限
- 客户端与服务端之间使用请求签名验证
- 内容安全策略 (CSP) 限制脚本执行来源

### 政策变更

如本隐私政策发生重大变更，我们将通过扩展内通知和更新日志告知用户。继续使用本扩展即表示您同意更新后的政策。

### 联系我们

如您对本隐私政策有任何疑问，请通过以下方式联系：

- 邮箱：privacy@aitradejournal.com
- 小红书：AI Trade Journal 官方账号

---

## Privacy Policy — AI Trade Journal (English)

### Overview

AI Trade Journal (the "Extension") is a Chrome browser extension that helps users sync broker trade data to Notion with AI-powered trade analysis. We value your privacy and are committed to handling your data transparently.

### Data We Collect

**Data you provide:**
- **Trade data:** Trade record text that you manually paste via the Smart Paste feature (CSV, tab-separated, or free text format). We only receive this data when you actively paste it.
- **Notion OAuth tokens:** When you authorize a connection to your Notion workspace, we obtain access tokens through the OAuth 2.0 flow.
- **License keys:** The 16-character activation code you enter when activating the product.

**Automatically collected data:**
- **Usage metrics:** AI analysis call counts and input/output token counts (for quota management and cost control). Aggregated by date and license key; does not include trade content.

### Data We Do NOT Collect

- Browsing history or browsing behavior
- Personal identity information (name, ID number, phone number, etc.)
- Financial account login credentials (broker usernames or passwords)
- Device fingerprints or tracking information
- Contacts or social connections

### How Data Is Processed

1. **Trade data parsing:** Trade text you paste is forwarded via a secure Cloudflare Worker proxy to the Claude AI API for parsing. The structured data is returned to you for local preview and confirmation.
2. **Notion sync:** After you confirm, structured trade data is sent via the Cloudflare Worker proxy to the Notion API, writing to your authorized Notion workspace.
3. **AI analysis:** When you trigger an analysis request, structured trade data is sent via the Cloudflare Worker proxy to the Claude AI API. Analysis results are returned to you.

All API communications are encrypted via HTTPS. API keys are stored server-side and are never exposed to client-side code.

### Data Storage

| Data Type | Storage Location | Retention |
|-----------|-----------------|-----------|
| Trade data (raw text) | Browser local storage (chrome.storage) | Deleted when user clears data or uninstalls extension |
| Parsed trade data | User's Notion workspace | Managed by user in Notion |
| Notion OAuth tokens | Cloudflare D1 database (server-side) | Deleted when user revokes authorization |
| License key status | Cloudflare D1 database (server-side) | Retained permanently (for license verification) |
| Usage metrics (call counts) | Cloudflare D1 database (server-side) | Auto-deleted after 90 days |
| AI analysis results | Browser local + user's Notion | Local: user clears manually; Notion: managed by user |

### Data Sharing

- **We do not sell user data to any third party.**
- Trade data is transmitted to third-party services only in these necessary scenarios:
  - **Anthropic (Claude AI):** For trade data parsing and analysis. Subject to Anthropic's data usage policy.
  - **Notion:** For syncing trade data to the user's workspace. Subject to Notion's privacy policy.
  - **Cloudflare:** As infrastructure provider processing API requests. Subject to Cloudflare's privacy policy.
- We do not share user data with any parties beyond the service providers listed above.

### Your Rights

- **View data:** You can view all synced trade data in your Notion workspace.
- **Delete data:** You can clear locally stored data at any time (via extension settings or by uninstalling), and delete trade records in Notion.
- **Revoke access:** You can revoke the Extension's access in your Notion settings at any time.
- **Export data:** All your trade data is stored in your own Notion workspace and can be exported at any time.

### Security Measures

- All network communications use HTTPS/TLS encryption
- API keys (Anthropic, Notion) are stored in server-side Cloudflare Workers, never in client-side code
- The Extension follows the principle of least privilege, requesting only `storage` and `sidePanel` permissions
- Request signing verification between client and server
- Content Security Policy (CSP) restricts script execution sources

### Policy Changes

If significant changes are made to this privacy policy, we will notify users via in-extension notifications and the changelog. Continued use of the Extension constitutes acceptance of the updated policy.

### Contact Us

If you have any questions about this privacy policy, please contact us:

- Email: privacy@aitradejournal.com
- Xiaohongshu: AI Trade Journal official account
