# Account-Opening Demo Runbook

This runbook covers the local account-opening end-to-end demo runner. It uses fake data only and is intended for QA and pilot readiness checks, not live supplier operations.

## Prerequisites

- Install workspace dependencies with `pnpm install`.
- Run from a local checkout of `laseration/ambe-pharma-intelligence`.
- No Microsoft Graph or SharePoint credentials are required for the default demo.
- The demo writes runtime artifacts to `apps/api/tmp/`, which is ignored by Git.

## Command

```bash
pnpm --filter @ambe/api demo:account-opening
```

Direct equivalent:

```bash
pnpm --filter @ambe/api exec tsx src/accountOpening/demo/fullAccountOpeningDemo.ts
```

## What The Demo Does

- Generates a fake fillable PDF AcroForm with demo-only branding.
- Creates a fake account-opening email from `demo.supplier@example.test`.
- Runs account-opening detection.
- Creates an in-memory durable demo case with safe evidence metadata.
- Generates and stores a completion draft.
- Saves reviewed field mappings, marking safe fields as `MAPPED_SAFE` and risky fields as `BLOCKED`.
- Generates an internal fill-value preview.
- Generates a binary PDF AcroForm preview.
- Downloads the binary preview through the service path and writes it to `apps/api/tmp/demo-binary-fill-preview.pdf`.
- Approves the completed unsigned form for filing with fake operator `demo-operator`.
- Files through a mock Microsoft Drive/SharePoint uploader by default.
- Prints readiness diagnostics when the readiness service is present.

## What It Does Not Do

- No signing.
- No supplier sending.
- No supplier submission.
- No Direct Debit or bank authority completion.
- No real bank details.
- No guarantee, indemnity, or director-only completion.
- No RP/GDP/WDA/CQC/GPhC declaration completion.
- No purchase, order, or buy workflow side effects.
- No external emails.
- No real customer or supplier forms.
- No production SharePoint upload by default.

## Expected Output

The command prints a step-by-step table covering:

- Detection
- Durable case creation
- Draft generation
- Field mapping
- Fill-value preview
- Binary PDF AcroForm preview
- Approval for filing
- Mock SharePoint/Microsoft Drive filing
- Readiness diagnostics

The final safety line should state that no signing, sending, submission, Direct Debit/bank authority completion, guarantee/indemnity/director-only completion, real bank details, or purchase/order/buy side effects were performed.

## Demo Artifacts

Runtime files are written to:

- `apps/api/tmp/demo-account-opening-form.pdf`
- `apps/api/tmp/demo-binary-fill-preview.pdf`

These files are generated at runtime and should not be committed.

## Inspecting The Generated PDF

Open `apps/api/tmp/demo-binary-fill-preview.pdf` in a PDF viewer that can inspect AcroForm fields. Safe company/contact fields should be filled. Signature, Direct Debit, bank account number, sort code, bank authority, personal guarantee, indemnity, Responsible Person, and WDA/GDP declaration fields should remain blank.

## Cleaning Demo Artifacts

Delete the ignored temp folder:

```bash
Remove-Item -Recurse -Force apps/api/tmp
```

On macOS/Linux:

```bash
rm -rf apps/api/tmp
```

## Storage Mode

The default demo uses a mock Microsoft Drive/SharePoint uploader. It does not call Microsoft Graph and does not upload to production SharePoint.

Real storage is intentionally not enabled by this demo runner. Any future real-storage mode must be explicit, opt-in, clearly labelled, and must use only safe demo tenant/folder configuration.

## Validation

Recommended validation after changes:

```bash
pnpm --filter @ambe/api exec prisma validate
pnpm --filter @ambe/api test -- accountOpening
pnpm --filter @ambe/api build
pnpm --filter @ambe/web build
pnpm --filter @ambe/api demo:account-opening
git diff --check
```
