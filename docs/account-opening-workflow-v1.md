# Account Opening Workflow V1

## Audit Summary

Current account-opening flow:

1. Inbound email classification identifies strong account-opening forms.
2. The email path creates one review-required account-opening case keyed by a stable source fingerprint.
3. Source evidence is stored as safe metadata, hashes, snippets, and attachment references.
4. A structured completion draft is generated from the configurable company profile, reviewer responses, and safety rules.
5. Operators review missing info, field mappings, signing notes, risk flags, and source evidence in the dashboard.
6. Operators can generate internal fill-value and binary previews.
7. Completed unsigned filing requires explicit operator approval and is internal Microsoft Drive filing only.

Existing statuses are preserved for compatibility:

- `PENDING_REVIEW`
- `NEEDS_INFO`
- `APPROVED_FOR_COMPLETION`
- `REJECTED`
- `CLOSED`

The dashboard now maps them to the v1 lifecycle:

- `RECEIVED`
- `CLASSIFYING`
- `NEEDS_REVIEW`
- `READY_FOR_REVIEW`
- `APPROVED_FOR_COMPLETION`
- `COMPLETION_PREVIEW_GENERATED`
- `COMPLETED_UNSIGNED_FILED`
- `SENT_MANUALLY`
- `REJECTED`
- `BLOCKED`
- `ARCHIVED`

`SENT_MANUALLY` is not set by automation. It remains an operator-side event outside the bot.

## Document Classification

Account-opening attachment metadata is classified deterministically into:

- `ACCOUNT_OPENING_FORM`
- `GDP_QUESTIONNAIRE`
- `TERMS_AND_CONDITIONS`
- `CREDIT_APPLICATION`
- `DIRECT_DEBIT_MANDATE`
- `BANK_MANDATE`
- `DIRECTOR_GUARANTEE`
- `TRADE_REFERENCES`
- `REGULATORY_DECLARATION`
- `UNKNOWN_OTHER`

Classification uses safe filename, MIME type, and safe snippets only. Raw attachment bytes and raw extracted text are not exposed in dashboard output.

Low-confidence or risky documents stay in review.

## Company Profile Source

The completion draft uses environment-backed account-opening profile fields:

- `ACCOUNT_OPENING_PROFILE_LEGAL_COMPANY_NAME`
- `ACCOUNT_OPENING_PROFILE_TRADING_NAME`
- `ACCOUNT_OPENING_PROFILE_COMPANY_NUMBER`
- `ACCOUNT_OPENING_PROFILE_VAT_NUMBER`
- `ACCOUNT_OPENING_PROFILE_REGISTERED_ADDRESS`
- `ACCOUNT_OPENING_PROFILE_TRADING_ADDRESS`
- `ACCOUNT_OPENING_PROFILE_MAIN_CONTACT_NAME`
- `ACCOUNT_OPENING_PROFILE_MAIN_CONTACT_EMAIL`
- `ACCOUNT_OPENING_PROFILE_MAIN_CONTACT_PHONE`
- `ACCOUNT_OPENING_PROFILE_ACCOUNTS_CONTACT`
- `ACCOUNT_OPENING_PROFILE_WEBSITE`
- `ACCOUNT_OPENING_PROFILE_BUSINESS_HOURS`
- `ACCOUNT_OPENING_PROFILE_COMPANY_TYPE`
- `ACCOUNT_OPENING_PROFILE_BUSINESS_DESCRIPTION`
- `ACCOUNT_OPENING_PROFILE_GPHC_PREMISES_NUMBER`
- `ACCOUNT_OPENING_PROFILE_RESPONSIBLE_PERSON`
- `ACCOUNT_OPENING_PROFILE_WHOLESALE_DEALER_AUTHORISATION`
- `ACCOUNT_OPENING_PROFILE_CQC_REGISTRATION`
- `ACCOUNT_OPENING_PROFILE_STANDARD_PAYMENT_PREFERENCE`

Missing values remain `To be confirmed`. The bot does not invent company, legal, regulatory, director, RP, or bank details.

## SharePoint Organisation

The current Microsoft Drive path remains config-compatible. Operators can configure a base folder such as:

```txt
AI BOT FOLDER/Account Opening
```

The v1 compatible target structure is:

```txt
AI BOT FOLDER/
  Account Opening/
    00 Inbox/
    01 Needs Review/
    02 Ready For Completion/
    03 Completed Unsigned Forms/
    04 Sent Manually/
    05 Rejected/
    06 Blocked/
    99 Archive/
```

Current archive packs store safe JSON only:

- signing notes
- risk summary
- missing info
- case summary
- completion draft
- source evidence metadata
- original attachment metadata

Completed unsigned filing stores only the approved internal binary preview and safe metadata. It does not upload signed forms.

## Safety Boundaries

The account-opening bot does not:

- sign documents
- submit forms
- send supplier/customer email
- complete Direct Debit mandates
- fill bank account numbers or sort codes
- complete guarantees, indemnities, director-only, RP/GDP/WDA, credit, or unknown legal declarations
- create purchase, order, buy, cart, checkout, or public marketplace actions

## Focused QA

Run:

```bash
pnpm qa:account-opening
```

This runs account-opening API tests, inbound account-opening email tests, and the web account-opening download-safety test without production credentials or real SharePoint.

## Remaining Gaps

- Real profile values still need operator/admin configuration through env or a future database-backed profile editor.
- Real SharePoint/Microsoft Graph filing still needs a dedicated app registration, permissions, site/drive IDs, and safe folder sign-off.
- Manual `SENT_MANUALLY` and archive state tracking are not persisted as new database statuses in this compatibility slice.
- Original PDF/DOCX form support remains limited to safe preview/fill paths already supported by the codebase.
