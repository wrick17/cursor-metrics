# Models & Pricing

## Cursor Models

The Cursor Models pool includes Cursor Grok 4.6, Grok 4.5, and Composer 2.5.

| Model | Provider | Input | Cache write | Cache read | Output | Notes |
| ----------------------------------------------------------- | -------- | ----- | ----------- | ---------- | ------ | ------------------------------------------------------------------------------------------------- |
| Grok 4.6 | Cursor | $2 | - | $0.5 | $6 | Jointly trained by Cursor and SpaceXAI |
| Grok 4.6 (Fast) | Cursor | $4 | - | $1 | $12 | Jointly trained by Cursor and SpaceXAI |
| Grok 4.5 | Cursor | $2 | - | $0.5 | $6 | Jointly trained by Cursor and SpaceXAI |
| [Composer 2.5](https://cursor.com/blog/composer-2-5) | Cursor | $0.5 | - | $0.2 | $2.5 | - |

### Model pricing

All prices are per million tokens:

| Model | Provider | Input | Cache write | Cache read | Output | Notes |
| --------------------------------------------------------------------------------------------- | --------- | ----- | ----------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Claude Opus 5](https://www.anthropic.com/claude/opus) | Anthropic | $5 | $6.25 | $0.5 | $25 | Requires Max Mode on legacy request-based plans |
| [Gemini 3.6 Flash](https://ai.google.dev/gemini-api/docs) | Google | $1.5 | - | $0.15 | $7.5 | - |
| [Kimi K3](https://www.moonshot.ai) | Moonshot | $3 | - | $0.3 | $15 | Hidden by default |
| [Future Model X](https://example.com) | Example | $9 | - | $0.9 | $45 | Hidden by default |

## Plans

| Plan | Price | Other Models usage included | Cursor Models |
| :--------------------- | :--------------------- | :-------------------------- | :---------------------- |
| **Start** (India only) | ₹649/mo, tax inclusive | $0 | Generous included usage |
| **Pro** | $20/mo | $20 | Generous included usage |

## Cursor Token Rate

On Teams and Enterprise plans, third-party model requests include a Cursor Token Rate of $0.25 per million tokens.
