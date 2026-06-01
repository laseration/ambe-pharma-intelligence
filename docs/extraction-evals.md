# Extraction Evaluation Harness

The API includes a deterministic local evaluation harness for supplier email and attachment extraction quality.

Run it from the repo root:

```bash
pnpm --filter @ambe/api eval:extraction
```

The default evaluation reads sanitized fixtures from:

```text
apps/api/fixtures/extraction-evals/cases.json
```

The default runner does not require Microsoft Graph, Telegram, OpenAI, a database, PDF parsing, OCR, or network access. AI-assisted behavior is covered through deterministic mocked AI responses stored in sanitized fixtures.

## Reported Metrics

The runner prints:

- total cases
- passed and failed cases
- extracted offer count
- false positives
- false negatives
- review-required cases
- auto-promotion eligible cases
- AI-used cases
- key mismatches per failed case

`Auto-promotion eligible` means the parser produced deterministic, high-confidence offer candidates that did not require review at the extraction layer. It is not a promise that downstream promotion will happen, because downstream checks still include source trust, supplier resolution, product matching, and qualification rules.

If any deterministic fixture fails, the command exits non-zero so CI can use it as a regression gate.

## Optional Live AI Mode

Live AI evaluation is disabled by default. To opt in locally:

```bash
AMBE_EXTRACTION_EVAL_LIVE_AI=1 pnpm --filter @ambe/api eval:extraction
```

or:

```bash
pnpm --filter @ambe/api eval:extraction -- --live-ai
```

Live AI outputs are non-deterministic and should not be used as CI gates. Mocked `mockAiResult` fixtures remain deterministic and are safe for CI.

## Current Fixture Coverage

The sanitized fixture set covers:

- clear supplier offer
- forwarded supplier offer
- ambiguous supplier context
- missing price
- multiple products
- irrelevant email
- AI fallback needed, using a mocked AI result
- PDF/text attachment extraction, using pre-extracted sanitized attachment text

## Adding Cases

Add a new object to [`apps/api/fixtures/extraction-evals/cases.json`](../apps/api/fixtures/extraction-evals/cases.json). Keep fixtures sanitized:

- use fake supplier domains such as `supplier-example.test`
- do not include real customer, supplier, patient, bank, or private contact data
- keep product examples generic and representative
- for attachment/PDF/OCR cases, store extracted text only unless the binary file is synthetic
- mark live AI behavior as non-deterministic; prefer `mockAiResult` for regression fixtures

Each case should include:

- `id`: stable lowercase identifier
- `title`: short human label
- `bodyText`: sanitized email text, when relevant
- `documents`: optional sanitized extracted attachment text/table text
- `mockAiResult`: optional deterministic AI parser result for AI fallback behavior
- `expected`: expected offer count, review requirement, parsing source, optional document class, and expected offer facts

Avoid assertions that are brittle to harmless copy changes. Prefer matching stable commercial facts: product text, price, currency, review requirement, and parsing source.

## Recommended Thresholds

Initial recommended thresholds:

- false positives: 0 on sanitized regression fixtures
- false negatives: 0 on clear supplier offer fixtures
- AI fallback cases: always review-required unless a future task explicitly changes review policy
- irrelevant emails: 0 extracted offers
- attachment text cases: no live OCR/PDF service required in default eval

Expand the fixture set with more sanitized real-world patterns before treating the eval as a full commercial-quality scorecard.
