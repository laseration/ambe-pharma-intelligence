# Pilot Operator Walkthrough

This walkthrough is for a safe local or demo pilot only. Do not connect live
Microsoft Graph, Telegram, outbound email, SharePoint, OneDrive, supplier, or
customer systems while using it.

## Preconditions

- Use a local or disposable environment.
- Do not use production credentials.
- Keep `DATABASE_URL` pointed at a local or disposable database.
- Keep live integration credentials unset, disabled, or replaced with
  placeholders from `.env.example`.
- Use sanitized supplier emails, fake review items, or mocked ingestion data
  only.

## Login And Session Check

1. Open the web dashboard.
2. Confirm unauthenticated access redirects to the internal login page.
3. Sign in with the configured local operator credential.
4. Confirm dashboard routes load only after sign-in.
5. Sign out or clear the session and confirm dashboard routes are blocked again.

Expected result: only authenticated internal operators can see review, setup,
diagnostics, buy, or deal workflow screens.

## Setup Readiness

1. Open **Setup**.
2. Review each readiness check.
3. Confirm missing configuration appears as an operator-facing next action, not
   as a stack trace, token, connection string, or raw service response.
4. Review worker cards for:
   - `Fresh`
   - `Stale`
   - `No success yet`
   - `Not configured`
   - `Disabled`
5. Treat `Stale`, `No success yet`, and `Not configured` as blockers before
   relying on current inbox state.

Expected blocked messages include:

- `Worker stale; refresh diagnostics before relying on latest inbox state.`
- `No successful worker run yet; refresh diagnostics before relying on latest inbox state.`
- `Worker not configured; finish setup before relying on inbox state.`

## Diagnostics

1. Open **Setup / Diagnostics**.
2. Confirm readiness checks and worker statuses are visible.
3. Confirm last errors are redacted.
4. Confirm diagnostic errors do not print full `DATABASE_URL` values, bearer
   tokens, passwords, API keys, raw emails, or attachment contents.

Expected result: diagnostics explain what operators should check next without
leaking credentials or source content.

## Supplier Review

1. Load a sanitized supplier offer in the review queue.
2. Confirm the review card shows:
   - source type
   - action state
   - why review is needed
   - the next action reason
3. Open the review detail page.
4. Inspect each offer row for:
   - fields extracted from the supplier source
   - trust and source information
   - missing fields and warnings
   - prior correction summaries
   - audit history
   - action status

Expected result: review items stay review-required until an operator explicitly
approves or rejects them.

## Corrections

1. Open a sanitized review item.
2. Make a correction to a key commercial field such as supplier, product, pack,
   price, currency, MOQ, or availability.
3. Confirm the correction is visible in the review detail.
4. If the item was already approved, confirm the action state becomes:
   `Corrected after approval; review again`.
5. Confirm approval controls for that stale approved item are blocked.

Expected result: changed commercial fields cannot silently keep stale approval.

## Approval And Execution Safety

1. On an unapproved review item, confirm the action state says
   `Approval required`.
2. Approve or reject only sanitized/local review data.
3. Confirm already approved items show `Already approved` instead of offering a
   second approval.
4. Confirm ordered or closed items show `Already executed`.
5. Confirm approval buttons are disabled when the item is already approved,
   executed, rejected, or corrected after approval.

Expected result: operators see a clear blocked reason before any
business-impacting action.

## Buy And Deal Follow-Up

1. After approval, inspect the buy decision or deal follow-up screen.
2. Confirm any publication, customer-facing offer, outbound notification, or
   execution action still requires the approved state.
3. Do not send real Telegram messages, emails, customer offers, supplier orders,
   SharePoint uploads, OneDrive uploads, or mailbox updates during this pilot.

Expected result: approved review state is visible before buy/deal follow-up,
and no external side effect is triggered in the safe pilot.

## Failure Handling

Use these operator responses during the pilot:

- `Needs review before execution`: inspect extracted fields, provenance, and
  missing evidence before approving.
- `Approval required`: explicitly approve or reject after review.
- `Corrected after approval; review again`: re-review corrected business fields
  before continuing.
- `Already executed`: inspect the existing execution/order record; do not repeat
  the action.
- stale worker state: refresh diagnostics and resolve worker health before
  trusting inbox completeness.

## Must Not Do

- Do not connect a real mailbox.
- Do not mark real email as read.
- Do not download real attachments.
- Do not call live OpenAI.
- Do not send Telegram messages or outbound email.
- Do not upload to SharePoint or OneDrive.
- Do not use production credentials.
- Do not print credentials, raw email bodies, or full attachment contents in
  issue comments, logs, screenshots, or PR descriptions.

## Pilot Evidence To Capture

Capture only safe metadata:

- sanitized fixture or demo item ID
- review item ID
- status before and after review
- blocked action reason, if any
- correction field names, not raw source content
- audit event type and timestamp
- worker freshness label
- commands run

Do not capture raw email bodies, raw attachments, access tokens, passwords,
connection strings, or real supplier/customer data.
