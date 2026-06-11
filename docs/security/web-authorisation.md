# Web dashboard authorisation

The web dashboard now uses explicit server-side capabilities instead of treating
any signed-in session as sufficient for every dashboard operation.

## Capability assumptions

- `viewer` is read-only for low-risk dashboard views: overview, imports, inbox,
  opportunities, product duplicate review, deals, and trade enquiry lists.
- `operator` is required for review workflow decisions, opportunity triage,
  trade enquiry status changes, and all account-opening review, preview, filing,
  and download operations.
- `admin` is required for setup and diagnostics because those pages expose
  deployment readiness, worker state, and operational configuration status.
- Account-opening pages and downloads default to `operator` because they expose
  supplier onboarding evidence and generated form artefacts.

The API key boundary remains unchanged. Capability checks only decide whether the
signed-in human may cause the web server to use its internal API credentials.
