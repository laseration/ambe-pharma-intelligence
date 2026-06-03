# Extraction Eval Fixtures

These fixtures are sanitized regression cases for supplier-offer extraction.
They must not contain real supplier, customer, product, price, email, or
attachment data.

## Adding A Case

Add a case to `cases.json` with:

- `id`: stable kebab-case identifier.
- `title`: short operator-readable name.
- `bodyText`: sanitized email text, or `documents` with sanitized extracted
  attachment text/table content.
- `mockAiResult`: optional mocked AI parser response. This is schema-validated
  by the eval harness and remains deterministic.
- `expected`: safe expected outputs:
  - `commerciallyRelevant`
  - `offerCount`
  - `reviewRequired`
  - optional `parsingSource`
  - optional `documentClass`
  - `offers` with product identity plus field expectations.

Prefer small cases that isolate one behavior: clear extraction, irrelevant
content, ambiguous review-required content, adversarial text, attachment text,
or schema-invalid mocked AI output.

## Safety Rules

- Do not use production data or real mailbox exports.
- Do not paste raw supplier/customer emails or attachments.
- Keep `mockAiResult` deterministic and sanitized.
- Default eval runs must not call live OpenAI. Live AI mode is explicitly
  optional and must not be used for CI gates.
- Eval output is intentionally aggregate-only: counts, statuses, case IDs,
  parser source, document class, and mismatch field names.
