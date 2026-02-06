# Performance Benchmarks

## Targets

| Metric | Target | Status |
|--------|--------|--------|
| Parse 10 trades | < 3s | Dependent on Claude API latency (~2-3s) |
| Parse 100 trades | < 8s | Dependent on Claude API latency (~5-8s) |
| AI analysis | < 5s | Dependent on Claude API latency (~3-5s) |
| Side Panel initial load | < 500ms | ~100ms (Preact + Tailwind, no external deps) |
| Notion sync per trade | ~340ms + API latency | Sequential with delay for rate limiting |
| Extension bundle size | < 500KB | ~73KB pre-build (estimated <150KB post-build) |

## Client-side Performance

- **Framework:** Preact (3KB gzipped) — minimal runtime overhead
- **CSS:** Tailwind CSS with purging — only used classes included
- **State:** No external state library — useState/useEffect hooks only
- **Storage:** chrome.storage.local reads cached per session via wrapper functions
- **No blocking operations** in service worker

## API Timeouts

| Endpoint | Timeout |
|----------|---------|
| Standard API calls | 15s |
| Parse/Analyze (Claude API) | 30s |
| Health check | 5s |

## Notion API Rate Limiting

- Notion API limit: 3 requests/second
- Batch sync delay: 340ms between sequential writes
- Retry on 429/5xx: exponential backoff with jitter
  - Retry 1: 500ms + random(0-200ms)
  - Retry 2: 1000ms + random(0-400ms)
  - Retry 3: 2000ms + random(0-800ms)
  - Max retries: 3

## Cost Per Operation (Claude API)

| Operation | Model | Est. Input Tokens | Est. Output Tokens | Est. Cost |
|-----------|-------|-------------------|--------------------| ---------|
| Parse trades | claude-sonnet-4-20250514 | ~2000 | ~1500 | ~$0.003 |
| Analysis | claude-sonnet-4-20250514 | ~3000 | ~2000 | ~$0.008 |
| Per user/day (10 analyses) | - | - | - | ~$0.08 |
