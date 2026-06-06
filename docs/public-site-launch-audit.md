# Public Site Launch Audit

Last reviewed: 2026-06-06

## Verified public details currently used

- Public email: `info@ambemedical.com`
- Public phone: `+44 (0)1732 760900`
- Public pages included in sitemap: `/`, `/about`, `/services`, `/comparator-sourcing`, `/onboarding`, `/contact`
- Internal pages intentionally excluded from sitemap: `/login`, `/dashboard`
- Default production domain in code: `https://ambemedical.com`

## Hard launch gates

All items in this section must be signed off before production launch.

- [ ] No placeholder copy remains in public UI, metadata, footer, sitemap, or
      generated structured data.
- [ ] No unverified compliance claims are present in public copy, metadata, or
      structured data.
- [ ] No unverified facility or logistics claims are present, including
      warehousing, cold-chain, stockholding, 3PL, fulfilment site, or operating
      site claims.
- [ ] `/login` has `noindex,nofollow` metadata.
- [ ] `/dashboard` remains protected by middleware.
- [ ] `/dashboard` and `/login` are absent from the public marketing sitemap.
- [ ] Privacy policy, cookie notice, legal footer, and terms decision is
      confirmed. Do not add broken or placeholder legal links.
- [ ] Public contact details are confirmed: `info@ambemedical.com` and
      `+44 (0)1732 760900`.
- [ ] Production domain is confirmed and `NEXT_PUBLIC_SITE_URL` is set to the
      chosen canonical origin.
- [ ] Mobile header and footer have been checked on a phone-sized viewport.
- [ ] `pnpm --filter @ambe/web build` passes on the production branch.

## Compliance wording audit

The public website copy is written conservatively around pharmaceutical trading
enquiries, comparator sourcing requirements, procurement context, supplier and
customer onboarding, and documentation-led review.

The public website must not claim any of the following unless verified source
material is added and reviewed:

- MHRA approval or MHRA licence status.
- WDA licence status.
- Current warehousing, licensed storage, or operating-site capability.
- Current cold-chain storage.
- Current stockholding.
- Current 3PL operations.
- Regulatory approval, accreditation, awards, client logos, testimonials, or
  years of experience.
- Physical address, company number, legal identifiers, or legal entity details.

## Human-verification TODOs

Use this section to record the decision owner and evidence before launch.

| Item | Required decision | Evidence/source | Status |
| --- | --- | --- | --- |
| Legal entity display | Confirm whether legal entity name, company number, or registered address should appear publicly. | To be provided by Ambe/legal reviewer. | TODO |
| Licence/regulatory wording | Confirm whether any licence or regulator wording is permitted. | To be provided by Ambe/legal reviewer. | TODO |
| Facility/logistics wording | Confirm whether any facility, storage, fulfilment, or logistics wording is permitted. | To be provided by Ambe/operations reviewer. | TODO |
| Privacy/cookie/legal pages | Confirm whether pages are required before launch and who supplies approved legal text. | To be provided by Ambe/legal reviewer. | TODO |
| Public contact details | Confirm email and phone number remain correct for production. | Ambe business owner confirmation. | TODO |
| Production domain | Confirm apex vs `www` canonical domain and redirects. | Hosting/DNS owner confirmation. | TODO |
| Mobile header/footer QA | Confirm public navigation and footer remain usable on mobile. | Browser/device QA. | TODO |

## Current non-public decisions

- No public physical address is displayed.
- No company number or legal identifier is displayed.
- No licence, MHRA/WDA, warehousing, cold-chain, stockholding, 3PL, or
  operating-site claim is displayed.
- No privacy, cookie, terms, or legal footer links are displayed because the
  corresponding approved pages do not yet exist.
- The contact page remains mailto/tel focused; adding a backend enquiry handler
  is a separate implementation decision.
