# Architecture Decisions

## Sprint 1 — Project Scaffold Decisions

### Decision 1: CRXJS v2 Beta for Vite Integration

**Context:** CRXJS v2 (beta.28) is the only CRXJS version that supports Vite 5 and Manifest V3. The v1 stable release does not support Vite 5.

**Decision:** Use `@crxjs/vite-plugin@2.0.0-beta.28`. Monitor for stable release.

**Risk:** Beta software could have bugs. Mitigation: pin exact version, test build output thoroughly.

### Decision 2: Preact over React for Bundle Size

**Context:** Chrome Extension side panels have a 400px width constraint and need to load fast. Preact is ~3KB vs React's ~40KB.

**Decision:** Use Preact with `@preact/preset-vite` for JSX support. Preact's hooks API is nearly identical to React's.

**Trade-off:** Smaller ecosystem than React, but the extension UI is simple enough that this doesn't matter.

### Decision 3: i18n via Chrome's Built-in chrome.i18n API

**Context:** Chrome extensions have a native i18n system using `_locales/` directories and `chrome.i18n.getMessage()`. Alternatives include i18next or custom solutions.

**Decision:** Use Chrome's built-in i18n. It handles locale detection automatically, works in manifest.json for extension name/description, and adds zero bundle size.

**Trade-off:** Less flexible than i18next (no runtime language switching, no pluralization rules). Acceptable for v1.

### Decision 4: Dark Theme as Default

**Context:** CLAUDE.md specifies "traders prefer dark UIs." The trading audience uses dark themes on broker platforms and Notion.

**Decision:** Dark theme only for v1. Theme toggling can be added in a future sprint.

**Rationale:** Single theme reduces CSS complexity. The custom color palette (surface, accent, profit/loss) is designed specifically for dark mode readability.

### Decision 5: CORS Wildcard on Worker (Development)

**Context:** The Worker uses `Access-Control-Allow-Origin: *` for development. In production, this should be restricted to the extension's origin.

**Decision:** Use wildcard for Sprint 1 scaffold. Add origin restriction before Chrome Web Store submission.

**TODO:** Replace `*` with `chrome-extension://<extension-id>` before production deployment.

### Decision 6: Request Signing with HMAC-SHA256

**Context:** Need to prevent unauthorized access to the Worker proxy. Chrome extensions can't use traditional cookies/sessions.

**Decision:** Use HMAC-SHA256 signatures with the license key as the signing secret. The timestamp prevents replay attacks (5-minute tolerance).

**Trade-off:** License key doubles as auth credential, which means key rotation affects auth. Acceptable for v1 single-device model.

### Decision 7: Prompt Embedded in Worker Route (Temporary)

**Context:** CLAUDE.md specifies prompts should live in `/src/prompts/` as versioned files. However, the Worker needs to include the prompt in Claude API calls.

**Decision:** For Sprint 1, the parser prompt system message is embedded in `worker/src/routes/claude.js` as a function return. The canonical versioned prompt file exists at `extension/src/prompts/parser.v1.md` for documentation and version tracking. In Sprint 2, implement a prompt loading system that serves prompts from a shared location.

### Decision 8: Service Worker as State Hub

**Context:** Multiple extension components (popup, side panel) need shared state. Options: chrome.storage only, or use background service worker as coordinator.

**Decision:** Background service worker acts as central message router. All state reads/writes go through it via `chrome.runtime.sendMessage()`. This ensures consistency and allows the service worker to coordinate API calls.

**Trade-off:** Adds message-passing overhead. But it prevents race conditions on chrome.storage and centralizes error handling.

## Sprint 1 Step 2 — Integration Decisions

### Decision 9: Server-Side Notion Token Storage

**Context:** Notion OAuth tokens should never be sent to the client extension. The Worker stores tokens in D1 and makes API calls on behalf of the user.

**Decision:** `notion_connections` table stores access_token, workspace_id, and template_db_id. The extension only knows "connected: true/false" via the `/notion/status` endpoint.

**Rationale:** Prevents token theft if extension is compromised. Simplifies extension code — no token management needed.

### Decision 10: OAuth CSRF Prevention via D1 State Tokens

**Context:** The Notion OAuth callback is browser-navigated (no extension auth headers). Need to link the callback to the correct license key.

**Decision:** Generate random UUID state token, store `(state, license_key)` mapping in `oauth_states` table, pass state in OAuth URL. On callback, look up license key from state and delete the token. Auto-clean expired states (>10 min).

### Decision 11: Rate Limiter Owns analysis_count, Token Tracker Only Updates Tokens

**Context:** Initial implementation double-counted analysis_count (once in rate limiter, once in trackUsage). This halved the effective daily limit.

**Decision:** The rate limiter atomically increments `analysis_count` via `INSERT...ON CONFLICT DO UPDATE WHERE analysis_count < ?`. The `trackTokenUsage` function only updates `token_input` and `token_output` fields (inserts with `analysis_count=0`).

**Rationale:** Single source of truth for usage counting prevents double-counting bugs.

### Decision 12: Auth Middleware Fails Closed on DB Error

**Context:** Auth middleware must decide what to do when D1 is unreachable. Failing open would allow unauthenticated access during outages.

**Decision:** Return `AUTH_SERVICE_UNAVAILABLE` error when DB check fails. This means D1 outages block all API access.

**Trade-off:** Availability sacrifice for security. Acceptable because D1 outages are rare and the alternative (open access) could incur unbounded API costs.

### Decision 13: Parsed Trades Stored in chrome.storage for Analysis Tab

**Context:** The Analysis tab needs trade data to send to the `/claude/analyze` endpoint. Options: re-fetch from Notion, or store locally after parsing.

**Decision:** Store the most recent parsed/synced trades in `chrome.storage.local` under `recentTrades`. The Analysis tab reads from this storage automatically.

**Trade-off:** Trades may become stale if user trades outside the extension. Acceptable for v1 — analysis is always on "current session" trades.
