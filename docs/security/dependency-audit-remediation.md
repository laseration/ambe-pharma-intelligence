# Dependency audit remediation

## Production audit status

`pnpm audit --prod` is the production dependency audit command.

This branch removes runtime use of the deprecated `xlsx` package from API
imports and replaces it with `exceljs` for flat worksheet reads. The parser still
selects the worksheet that looks most like tabular data and delegates row/header
normalisation to the existing import table parser.

## XLSX import scope

The supported spreadsheet subset is intentionally narrow:

- `.xlsx` uploads only.
- Flat worksheet rows and cells.
- Best worksheet selection by recognised header score, then parsed row count.
- Strings, numbers, booleans, dates, rich text, hyperlinks, and cached formula
  results are coerced to import table values.
- Workbook size, sheet count, row count, and column count are bounded before
  rows are passed to import validation.
- Prototype-pollution header keys are replaced before table parsing.

Unsupported or malformed workbooks fail with a clear import error rather than a
silent partial parse.

## Overrides

The root `pnpm.overrides` block pins vulnerable transitive dependencies while
upstream packages catch up:

- `qs@6.15.2` for `express` and `body-parser`.
- `postcss@8.5.10` for `next@15.5.19`.
- `uuid@11.1.1` for `exceljs`.

These overrides should be removed once the parent packages resolve safe versions
without overrides and the full verification suite remains green.
