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

## Current Fixture Matrix

The sanitized matrix covers clear body offers, forwarded offers, attachment
text, attachment table headers, spreadsheet-like column names, mixed
currencies, MOQ price breaks, expiry context, availability wording, duplicate
rows, price-on-request wording, noisy footers, ambiguous pack/quantity wording,
weak product matches, adversarial instructions, and non-commercial attachments.

Known remaining blind spots before real supplier email testing:

- Duplicate rows are counted rather than deduplicated.
- Expiry dates are review context only; the aggregate eval does not score an
  expiry field.
- Table parsing still relies on sanitized extracted text rows rather than a
  full workbook parser.
- MOQ tiers and availability prose are covered through deterministic mocked AI
  fixtures, not live AI.
- Supplier identity, customer eligibility, and approval side effects are outside
  this extraction-only fixture harness.

## Safety Rules

- Do not use production data or real mailbox exports.
- Do not paste raw supplier/customer emails or attachments.
- Keep `mockAiResult` deterministic and sanitized.
- Default eval runs must not call live OpenAI. Live AI mode is explicitly
  optional and must not be used for CI gates.
- Eval output is intentionally aggregate-only: counts, statuses, case IDs,
  parser source, document class, and mismatch field names.
