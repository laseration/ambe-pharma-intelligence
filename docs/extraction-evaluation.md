# Extraction Evaluation Harness

The API includes a local evaluation harness for supplier email and document extraction quality.

Run it from the repo root:

```bash
pnpm --filter @ambe/api eval:extraction
```

The default evaluation reads sanitized fixtures from:

```text
apps/api/fixtures/extraction-evals/cases.json
```

It does not require Microsoft Graph, Telegram, OpenAI, a database, PDF parsing, OCR, or network access. AI-assisted behavior is covered through deterministic mocked AI responses stored in sanitized fixtures; live OpenAI calls are deliberately disabled for the default eval.

## What It Reports

The runner prints:

- total cases
- passed and failed cases
- extracted offer count
- false positives
- false negatives
- review-required cases
- auto-promotion eligible cases
- key mismatches per failed case

“Auto-promotion eligible” means the parser produced deterministic, high-confidence offer candidates that did not require review at the extraction layer. It is not a promise that downstream promotion will happen, because downstream checks still include source trust, supplier resolution, product matching, and qualification rules.

## Current Fixture Coverage

The sanitized fixture set covers:

- clear supplier offer
- forwarded supplier offer
- ambiguous supplier context
- missing price
- multiple products
- irrelevant email
- AI fallback needed, using a mocked AI result
- attachment/PDF/OCR-style text, using pre-extracted sanitized attachment text

## Adding Cases

Add a new object to [`apps/api/fixtures/extraction-evals/cases.json`](../apps/api/fixtures/extraction-evals/cases.json). Keep fixtures sanitized:

- use fake supplier domains such as `supplier-example.test`
- do not include real customer, supplier, patient, bank, or private contact data
- keep product examples generic and representative
- for attachment/PDF/OCR cases, store extracted text only unless the binary file is synthetic

Each case should include:

- `id`: stable lowercase identifier
- `title`: short human label
- `bodyText`: sanitized email text, when relevant
- `documents`: optional sanitized extracted attachment text/table text
- `mockAiResult`: optional deterministic AI parser result for AI fallback behavior
- `expected`: expected offer count, review requirement, parsing source, optional document class, and expected offer facts

Avoid assertions that are brittle to harmless copy changes. Prefer matching stable commercial facts: product text, price, currency, review requirement, and parsing source.

## Recommended Thresholds

These are recommendations, not hard gates yet:

- false positives: 0 on sanitized regression fixtures
- false negatives: 0 on clear supplier offer fixtures
- AI fallback cases: always review-required unless a future task explicitly changes review policy
- irrelevant emails: 0 extracted offers
- attachment text cases: no live OCR/PDF service required in default eval

Before making this a CI gate, expand the fixture set with more sanitized real-world patterns and agree acceptable review-burden thresholds with operators.
