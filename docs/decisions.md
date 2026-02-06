# Architectural Decisions

## Sprint 1 Decisions Log

### ADR-001: Preact over React
**Date:** 2026-02-06
**Status:** Accepted

**Context:** Chrome extensions have strict bundle size constraints. Side Panel must load fast.
**Decision:** Use Preact (3KB) instead of React (40KB+). Same JSX API via preact/compat.
**Consequences:** Smaller bundle, faster load. Some React ecosystem libraries may need testing.

### ADR-002: Cloudflare Workers for Backend
**Date:** 2026-02-06
**Status:** Accepted

**Context:** Need a lightweight API proxy to hide API keys from client. Must be cheap to operate at low scale (< 1000 users initially).
**Decision:** Cloudflare Workers + D1 (SQLite) + KV for rate limiting.
**Consequences:** Free tier covers 100K requests/day. D1 provides SQL without provisioning. Cold start < 5ms. Limited to 10ms CPU per request (sufficient for proxy).

### ADR-003: Claude Sonnet for AI Analysis
**Date:** 2026-02-06
**Status:** Accepted

**Context:** Need cost-effective AI model for trade parsing and analysis. Budget: keep per-user cost under $0.10/day.
**Decision:** Use claude-sonnet-4-20250514 — best cost/performance ratio. Fallback to Haiku if costs exceed $200/month.
**Consequences:** ~$0.003 per parse, ~$0.008 per analysis. 10 analyses/day = ~$0.08/user/day.

### ADR-004: Chinese-First with i18n from Day 1
**Date:** 2026-02-06
**Status:** Accepted

**Context:** Primary market is Chinese retail traders on Xiaohongshu. However, some users trade on English-language platforms.
**Decision:** All UI strings go through i18n module. Chinese (zh_CN) is default. English as secondary.
**Consequences:** No hardcoded strings in JSX. Slightly more code, but enables market expansion later.

### ADR-005: Side Panel as Primary UI
**Date:** 2026-02-06
**Status:** Accepted

**Context:** Popup windows in Chrome close when user clicks elsewhere. Side Panel persists alongside browser tabs.
**Decision:** Side Panel for main workspace (Smart Paste, Analysis, History, Settings). Popup for quick status only.
**Consequences:** 400px width constraint. Users can keep journal open while browsing broker pages.

### ADR-006: ¥299 One-Time Pricing
**Date:** 2026-02-06
**Status:** Accepted

**Context:** Target audience is price-sensitive retail traders. Subscription fatigue is real. Notion AI subscription costs ¥96/month.
**Decision:** One-time purchase at ¥299, bundled with Notion template. No recurring charges.
**Consequences:** Revenue = units sold × ¥299. Must control per-user costs (rate limits, model selection). License key system needed.

### ADR-007: Notion as Data Backend
**Date:** 2026-02-06
**Status:** Accepted

**Context:** Target users already use Notion for note-taking. Building a custom database would increase costs and complexity.
**Decision:** Sync trades directly to user's Notion workspace via Notion API. User owns their data.
**Consequences:** Depends on Notion API stability. 3 req/s rate limit. User needs Notion account. No vendor lock-in for user data.

### ADR-008: Onboarding Wizard Design (Sprint 1 Step 3)
**Date:** 2026-02-06
**Status:** Accepted

**Context:** New users need to complete 3 setup steps before using the extension: license activation, Notion OAuth, database creation.
**Decision:** Linear wizard with 5 screens (welcome, license, Notion, database, done). Each step allows retry on failure. Back button available on steps 2-3. Completion stored in chrome.storage.
**Consequences:** Users can't access main features until onboarding complete. Prevents confusion from partial setup.

### ADR-009: Confidence Scoring UX
**Date:** 2026-02-06
**Status:** Accepted

**Context:** Parser sometimes has low confidence on ambiguous fields. Users need to know which trades may need manual verification.
**Decision:** Color-coded confidence badges: green (≥90%), yellow (≥70%), red (<70%). Inline editing on preview table lets users correct before syncing.
**Consequences:** Users trust the parser output more. Reduces Notion data quality issues.

### ADR-010: Error Message Strategy
**Date:** 2026-02-06
**Status:** Accepted

**Context:** Technical error messages confuse non-technical traders. Need user-friendly error handling.
**Decision:** All errors mapped to Chinese-first messages with: clear description, suggested action, retry button. Error codes from backend are mapped client-side via i18n.
**Consequences:** Better user experience. Backend can remain code-focused. Adding new error types requires updating both backend codes and i18n strings.

### ADR-011: Production Hardening Approach
**Date:** 2026-02-06
**Status:** Accepted

**Context:** Moving from prototype to production-ready for paying users.
**Decision:**
- Notion API: exponential backoff with jitter (500ms/1000ms/2000ms + random jitter, max 3 retries)
- Batch syncing: sequential writes with 340ms delay, progress reporting
- Rate limiting: pre-check before API calls, 10/day and 200/month limits
- Structured JSON logging on every request
- CORS locked to chrome-extension:// origin in production
**Consequences:** Higher reliability. Observable costs. Slightly slower batch operations.
