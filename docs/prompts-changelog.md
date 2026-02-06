# Prompt Version History

## Parser Prompt

### v1.1 (2024-02-06)
- Added 8 few-shot examples covering all major formats
- Added Webull and Schwab CSV examples
- Added options trade parsing with strike/expiry
- Added fractional shares support
- Added multi-currency detection per trade
- Added duplicate trade flagging
- Added tab-separated format support
- Added non-trade data rejection example
- Explicit handling for mixed valid/invalid rows
- Improved confidence scoring guidance

### v1.0 (2024-01-01)
- Initial parser prompt
- Basic Futu CSV + free text support
- Single output schema

## Analyst Prompt

### v1.0 (2024-02-06)
- Initial analyst prompt with 6 analysis types
- Scoring guide (0-100)
- Edge case handling
- Chinese-first with English fallback
- 200-character limit for text fields
