# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────┐
│                Chrome Extension                  │
│                                                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐ │
│  │  Popup   │  │ Side Panel│  │Content Script│ │
│  │(quick UI)│  │ (main UI) │  │  (Phase 2)   │ │
│  └────┬─────┘  └─────┬─────┘  └──────┬───────┘ │
│       │              │               │          │
│       └──────────┬───┘───────────────┘          │
│                  │                               │
│       ┌──────────┴──────────┐                   │
│       │  Background Service │                   │
│       │      Worker         │                   │
│       │  (state hub +       │                   │
│       │   message router)   │                   │
│       └──────────┬──────────┘                   │
└──────────────────┼──────────────────────────────┘
                   │ HTTPS + HMAC signing
                   ▼
┌─────────────────────────────────────────────────┐
│           Cloudflare Worker (Proxy)              │
│                                                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐ │
│  │  Auth    │  │ Rate Limit│  │   Router     │ │
│  │Middleware│──│ Middleware │──│              │ │
│  └──────────┘  └───────────┘  └──────┬───────┘ │
│                                       │         │
│       ┌──────────────┬───────────────┐│         │
│       ▼              ▼               ▼│         │
│  ┌─────────┐  ┌───────────┐  ┌────────────┐   │
│  │ Claude  │  │  Notion   │  │  License   │   │
│  │  Proxy  │  │  Proxy    │  │  Manager   │   │
│  └────┬────┘  └─────┬─────┘  └──────┬─────┘   │
│       │             │               │          │
│  ┌────┴─────────────┴───────────────┴────┐     │
│  │           D1 Database                  │     │
│  │  (licenses, usage tracking)            │     │
│  └────────────────────────────────────────┘     │
└──────────┬──────────────┬───────────────────────┘
           │              │
           ▼              ▼
    ┌─────────────┐ ┌─────────────┐
    │ Claude API  │ │ Notion API  │
    │ (Anthropic) │ │             │
    └─────────────┘ └─────────────┘
```

## Component Communication

All communication between extension components uses `chrome.runtime.sendMessage()` with a standardized message format:

```javascript
{
  action: 'ACTION_NAME',
  payload: { /* action-specific data */ }
}
```

## Data Flow: Smart Paste

1. User pastes trade text in Side Panel textarea
2. Side Panel sends `PARSE_TRADES` message to background worker
3. Background worker calls Worker proxy `/claude/parse`
4. Worker verifies auth, checks rate limits, proxies to Claude API
5. Claude parses text → structured JSON
6. Worker tracks usage, returns parsed trades
7. Background worker forwards to Side Panel
8. Side Panel displays preview table
9. User clicks "Confirm Sync"
10. Side Panel sends `SYNC_TO_NOTION` to background worker
11. Background worker calls Worker proxy `/notion/sync`
12. Worker writes trades to user's Notion database
