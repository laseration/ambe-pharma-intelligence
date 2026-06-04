# Correction-to-Eval Candidate Export

Applied operator corrections can be useful future extraction-eval cases, but
they must not be copied into fixtures directly. Use this export only for
fake/demo correction records and treat every output row as a candidate requiring
human sanitization.

## Command

Prepare a local JSON file containing fake/demo correction records, then run:

```bash
pnpm --filter @ambe/api eval:correction-candidates -- --input ./local/fake-demo-corrections.json --output ./local/correction-eval-candidates.json
```

The command reads only the input file. It does not read a database, call
Microsoft Graph, call OpenAI, send Telegram or email, use SharePoint or
OneDrive, or touch supplier/customer systems.

## Input Shape

The input can be a JSON array or an object with `records`.

Each record must be explicitly marked:

```json
{
  "sourceClassification": "FAKE_DEMO",
  "correction": {
    "id": "fixture-correction-1",
    "emailDerivedOfferId": "fixture-offer-1",
    "correctionStatus": "APPLIED",
    "correctedNormalizedProductName": "demo product 5mg tablet 28",
    "correctedUnitPrice": 8.4,
    "correctedCurrencyCode": "GBP"
  },
  "offer": {
    "normalizedProductNameCandidate": "demo product 5mg tablets",
    "priceCandidate": "8.90",
    "currencyCandidate": "EUR"
  },
  "provenance": {
    "sourceSystem": "fixture-email",
    "sourceTemplateFingerprint": "fixture-template-v1",
    "sourceChecksumSha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

Records not marked `FAKE_DEMO` are skipped. Corrections not in `APPLIED` status
are skipped.

## Output

The output is a `correction-eval-candidates.v1` JSON envelope. It includes:

- candidate IDs
- safe provenance IDs and checksums
- corrected field names
- before/after normalized values where safe
- redacted supplier identity presence
- correction reason category
- safety flags confirming raw bodies, attachment contents, notes, personal data,
  and live integrations were not exported

Every output has:

```json
{
  "status": "candidate",
  "requiresHumanSanitization": true
}
```

Candidate output is not a fixture. Do not commit it directly.

## Never Record

Do not put these values in the input file, output file, docs, tests, or PR
comments:

- raw email bodies
- attachment contents
- full sender, customer, or supplier personal data
- customer/supplier production identifiers
- tokens, API keys, passwords, or connection strings
- Microsoft Graph payloads
- Telegram payloads
- operator note content

The exporter uses a whitelist and ignores raw-body, attachment-content, note, and
payload-like fields, but the operator still owns the final review.

## Human Sanitization Checklist

Before turning a candidate into a committed extraction eval fixture:

- replace any real product, supplier, customer, or person names with fake values
- replace domains with `.example.test` or another reserved test domain
- remove or generalize any commercially sensitive prices if they came from real
  records
- keep only the minimal text needed to exercise the parser behavior
- verify no raw email body or attachment content is copied from production
- verify no token, connection string, Graph payload, or Telegram payload appears
- run `pnpm --filter @ambe/api eval:extraction`
- run `pnpm verify:safe`

## Remaining Gate

This export creates review material only. A human must still write or update the
sanitized fixture in `apps/api/fixtures/extraction-evals/cases.json` and confirm
the eval report remains aggregate and safe.
