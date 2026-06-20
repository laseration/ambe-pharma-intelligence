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

## 2026-06 advisory clean-up (api dependencies)

`pnpm audit --prod` reported 7 advisories (3 high, 4 moderate) across three
`apps/api` packages. All were resolved without overrides:

- **`nodemailer` (direct dep) removed.** It was declared in `apps/api` but never
  imported anywhere in the source tree (verified by grep). Dropping it — and the
  now-unused `@types/nodemailer` — cleared the TLS-validation, `jsonTransport`
  file-access, and CRLF List-header advisories on the `apps/api > nodemailer`
  path with zero code impact.
- **`mailparser` `^3.9.9` → `^3.9.11`.** The newer release already depends on the
  patched `nodemailer@9.0.1`, which clears the transitive "raw option bypass"
  high advisory. `mailparser` only uses `nodemailer/lib/addressparser`, which is
  unchanged across the bump.
- **`multer` `^2.1.1` → `^2.2.0`.** Closes both upload DoS advisories (deeply
  nested fields; incomplete cleanup of aborted uploads). Usage is limited to
  `memoryStorage()` in the imports and account-opening upload routes; the API is
  stable across the minor bump.

After the change `pnpm audit --prod` reports no known vulnerabilities and the
full verification suite (build, test, lint) remains green.
