# API Reference — Cloudflare Worker

Base URL: `https://worker.your-domain.workers.dev`

## Authentication

All requests must include:
- `X-License-Key`: 16-character license key
- `X-Timestamp`: ISO 8601 timestamp
- `X-Signature`: HMAC-SHA256 signature of `${timestamp}:${body}` (optional, recommended)

## Endpoints

### `GET /health`
Health check endpoint. No authentication required.

**Response:**
```json
{ "status": "ok", "timestamp": "2026-02-06T12:00:00.000Z" }
```

### `POST /claude/parse`
Parse raw trade data into structured JSON via Claude API.

**Request Body:**
```json
{ "raw_text": "string (CSV, tab-separated, or free-form text)" }
```

**Response (200):**
```json
{
  "trades": [
    {
      "symbol": "NVDA",
      "action": "BUY",
      "quantity": 100,
      "price": 135.50,
      "datetime": "2026-02-05T09:35:22-05:00",
      "total_amount": 13550.00,
      "commission": 0.99,
      "broker_detected": "Futu",
      "currency": "USD",
      "confidence": 0.95
    }
  ]
}
```

**Error Responses:**
- `400`: Invalid JSON, empty input, input too large
- `429`: Rate limit exceeded
- `502`: Claude API error
- `504`: Timeout

### `POST /notion/sync`
Sync parsed trades to Notion database.

**Request Body:**
```json
{ "trades": [{ /* trade objects */ }] }
```

**Response (200):**
```json
{ "success": true, "synced_count": 5 }
```

### `GET /notion/auth-url`
Get Notion OAuth authorization URL.

**Response (200):**
```json
{ "url": "https://api.notion.com/v1/oauth/authorize?..." }
```

### `POST /license/validate`
Validate a license key.

**Request Body:**
```json
{ "key": "ABCD1234EFGH5678" }
```

**Response (200):**
```json
{ "valid": true, "status": "active", "activated_at": "2026-02-01T10:00:00Z" }
```

### `POST /license/activate`
Activate a license key.

**Request Body:**
```json
{ "key": "ABCD1234EFGH5678", "notion_user_id": "user-id-string" }
```

**Response (200):**
```json
{ "success": true, "status": "active" }
```

## Rate Limits

| Scope | Limit | Reset |
|-------|-------|-------|
| Per user per day | 10 analyses | Midnight UTC |
| Per user per month | 200 analyses | 1st of month |
