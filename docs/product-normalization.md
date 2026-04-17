# Product Normalization Rules

The import pipeline uses a deterministic, rule-based normalizer for medicine and product names. It is intentionally cautious and explainable.

## What It Does

1. Trims and collapses whitespace.
2. Lowercases text for canonical processing.
3. Rewrites common shorthand tokens into canonical tokens.
   - `tab`, `tabs`, `tablets` -> `tablet`
   - `cap`, `caps`, `capsules` -> `capsule`
   - `caplets` -> `caplet`
4. Extracts:
   - `strength`
   - `formulation`
   - `packSize`
5. Builds a canonical normalized key:
   - `base-name|strength|formulation|packSize`

## Confidence Labels

- `HIGH`: base name, strength, and formulation were all extracted.
- `MEDIUM`: base name plus one of strength or formulation was extracted.
- `LOW`: only a weak or partial canonical name could be built.

## Examples

- `Amlodipine 5mg tabs 28` -> `amlodipine|5mg|tablet|28`
- `Amlodipine 5 mg tablets x 28` -> `amlodipine|5mg|tablet|28`
- `AMLODIPINE 5MG TAB 28` -> `amlodipine|5mg|tablet|28`
- `Paracetamol 500mg caplets 16` -> `paracetamol|500mg|caplet|16`

## Explainability

Each normalization result includes:

- cleaned input
- processed tokens
- rules applied
- extracted fields
- confidence label

The import service logs normalization and product-match decisions with these safe details.

## Known Limitations

- No fuzzy brand or ingredient matching is attempted.
- No automatic merge happens across clinically risky differences.
- Some formulation terms are intentionally left distinct, such as `caplet` vs `tablet`.
- Pack-size extraction is simple and may not fully understand complex packaging formats.
