# Account Opening — auto-fill & reply

This module takes a supplier **account-opening form** that arrives by email or
operator upload, fills the safe fields from Ambe's vetted master profile, and
(optionally, gated off by default) **replies to the internal sender** with an
unsigned review draft plus an "Ambe answers" sheet.

It is **review-first**: nothing is signed, submitted, or sent to a supplier. The
bot only ever produces a draft for a human to check.

## Pipeline

```
inbound email / upload
  → classify (account-opening form? — shared inbound classifier)
  → AccountOpeningCase created (deny-by-default policy, signing notes)
  → fill the form:
        .docx (content controls) → docxFill.ts
        .pdf  (AcroForm fields)  → pdfFill.ts
        flat/scanned/other       → not filled in place
        (dispatched by formFill.ts)
  → always build an "Ambe answers" PDF (answersSheet.ts)
  → email a review draft to an INTERNAL reviewer (reviewEmail.ts)
  → auto-reply to the internal sender (autoReply.ts), gated OFF
```

### Module map

| File               | Responsibility                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `docxFill.ts`      | Fill Word **content-control** forms ("Click here to enter text."). Heuristic label/section matching; deny-by-default. |
| `pdfFill.ts`       | Fill **AcroForm** (fillable) PDFs. Flat/scanned PDFs report `NO_FILLABLE_FIELDS`.                                     |
| `formFill.ts`      | Dispatcher: route by extension, normalise the result.                                                                 |
| `answersSheet.ts`  | Universal "Ambe answers" PDF — the reliable fallback for any form.                                                    |
| `reviewEmail.ts`   | Gated Microsoft Graph `sendMail` with the filled form + answers sheet attached.                                       |
| `autoReply.ts`     | Internal-sender-only auto-fill-and-reply; flag-gated; dedup + audit.                                                  |
| `masterProfile.ts` | Ambe's own details, read from `ACCOUNT_OPENING_PROFILE_*` env.                                                        |

The inbound trigger lives in `email/inbound/service.ts` (`ingestMessage`), which
calls `replyWithFilledAccountOpeningForm` after the case is persisted.

## Safety model

- **Never auto-filled** (deny-by-default, `NEVER_FILL` in `docxFill.ts`): bank
  name, account name/number, sort code, SWIFT/BIC, IBAN, **signature / print
  name**, credit terms, and unverifiable licence/GDP fields. These are listed on
  the answers sheet as "complete by hand".
- **Internal senders only.** `autoReplyAccountOpeningForm` replies only when the
  sender's domain is in `EMAIL_INBOUND_INTERNAL_DOMAINS` (default
  `ambemedical.com`). An external/supplier sender is **never** auto-replied — it
  only ever creates a review case.
- **Dormant by default.** Both `ACCOUNT_OPENING_AUTO_REPLY_ENABLED` and
  `EMAIL_INBOUND_POLLING_ENABLED` default to `false`.
- **No duplicate replies.** Before sending, the bot checks for an
  `ACCOUNT_OPENING_AUTO_REPLIED` case event and skips if present; it records that
  event only on a confirmed send. This survives worker restarts / re-delivery and
  is also the audit trail.
- **Honest fallback.** If zero fields were filled, the email is titled
  "COULD NOT AUTO-FILL (manual completion needed)" — it never claims a draft it
  didn't produce.
- **Non-blocking.** An auto-reply failure can never break inbound ingestion.

## Environment variables

Flags (booleans, default `false`):

- `ACCOUNT_OPENING_AUTO_REPLY_ENABLED` — turn on the auto-fill-and-reply step.
- `EMAIL_INBOUND_POLLING_ENABLED` — turn on inbox polling (shared with the
  offer/price pipeline — enabling it affects both).

Recipients / email (see `email/graph.ts` + `reviewEmail.ts`):

- `EMAIL_ALERTS_ENABLED`, `MICROSOFT_MAIL_*` / `MICROSOFT_GRAPH_*`,
  `MICROSOFT_GRAPH_SENDER_MAILBOX` — outbound Graph mail.
- `ACCOUNT_OPENING_REVIEW_EMAIL_RECIPIENTS` — optional explicit reviewer list
  (falls back to `INTERNAL_ALERT_EMAIL_RECIPIENTS`). The auto-reply itself
  replies to the **sender**, not this list.

Master profile (Ambe's own details — `ACCOUNT_OPENING_PROFILE_*`, read by
`masterProfile.ts`): legal/trading name, company number, VAT, registered/trading
address, main contact, accounts contact, responsible person, website, company
type, business description, GPhC/premises number, WDA. **Unset values render as
"To be confirmed" and are dropped from the fill** — so a thin profile produces
thin fills (the answers sheet still lists every field).

## Go-live / canary

Enabling is a deliberate, internal-first step. The VPS carries two scripts:

```bash
ssh ambe-vps bash /root/ao-golive.sh     # enable polling + auto-reply, restart
ssh ambe-vps "pm2 logs ambe-worker"      # watch it process + reply (Ctrl-C to quit)
ssh ambe-vps bash /root/ao-rollback.sh   # disable both again, restart
```

> Note: `ao-golive.sh` also turns on inbox polling, which the offer/price
> pipeline shares — enabling it processes the **whole** unread inbox, not just a
> test email. Prefer a clean inbox for the canary.

To test without waiting for anyone else: with auto-reply enabled, email an
account-opening form from any `@ambemedical.com` address into the bot mailbox;
the bot replies to **you**.

## Known limitations

- **Only fillable formats fill in place.** Word content-control forms and
  AcroForm PDFs fill; flat/scanned PDFs, legacy `.doc`, and blank-line Word get
  the answers sheet instead.
- **Heuristics are tuned to one form** (Doc002A V3). Other layouts (multi-column,
  repeated sections, unusual label placement) may mis-map; the reviewer must
  always check. The answers sheet is the safety net.
- **Scanned forms may not classify.** OCR'd text is weighted below the
  account-opening gate in the shared classifier, so a scanned form can stay in
  manual review and not trigger auto-reply.
- **Master profile is thin.** Per-section sales/customer-service contacts and
  several dates are not yet in the profile env.

## Tests

`__tests__/`: `docxFill`, `pdfFill`, `formFill`, `answersSheet`, `reviewEmail`,
`autoReply` (unit), plus the inbound→auto-reply wiring test in
`email/inbound/__tests__/account-opening.test.ts`. Run via `pnpm verify:safe`.
