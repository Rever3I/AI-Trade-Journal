# Prompt Version Changelog

## parser.v1.md — Trade Data Parser

### v1.0.0 (2026-02-06)
- Initial version
- Supports: Futu CSV (Chinese headers), IBKR tab-separated, free-form text
- 3 few-shot examples included
- Edge case handling: empty input, non-trade data, single trade, 100+ trades
- Token budget: < 2000 output tokens
- Confidence scoring with ambiguous field tracking

## analyst.v1.md — Trade Review Analyst

### v1.0.0 (2026-02-06)
- Initial version
- 6 analysis templates: daily_review, single_trade, weekly_stats, strategy_eval, emotion_check, risk_assessment
- Scoring system: 0-100 based on execution quality
- Language: Chinese default with English fallback
- Token budget: < 3000 output tokens
