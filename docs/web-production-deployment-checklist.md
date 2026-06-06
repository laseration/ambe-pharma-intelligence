# Web Production Deployment Checklist

Last reviewed: 2026-06-06

This checklist is for the Next.js web app serving the public Ambe Medical Group
website at `https://ambemedical.com` while keeping internal tooling behind
`/login` and `/dashboard`.

## Build And Start

- Install dependencies with `pnpm install --frozen-lockfile`.
- Build the web app with `pnpm --filter @ambe/web build`.
- Start the built web app with `pnpm --filter @ambe/web start`.
- Set the hosting platform port through its normal `PORT` mechanism if needed.

## Required Web Environment

- `NODE_ENV=production`
- `NEXT_PUBLIC_SITE_URL=https://ambemedical.com`
- `WEB_AUTH_USERNAME`
- `WEB_AUTH_PASSWORD`
- `WEB_AUTH_ROLE=operator` or another valid internal role
- `WEB_AUTH_SESSION_SECRET` with at least 32 random characters
- `WEB_AUTH_SESSION_TTL_SECONDS`, optional, defaults to 8 hours
- `INTERNAL_API_BASE_URL`, server-side API `/api` base URL
- `INTERNAL_API_KEY`, server-side internal API key for dashboard requests
- `ACCOUNT_OPENING_EXPORT_DOWNLOAD_TOKEN`, only if export downloads are enabled

Do not put internal API keys, dashboard passwords, session secrets, database
URLs, Graph credentials, Telegram tokens, or OpenAI keys in `NEXT_PUBLIC_*`
variables. Do not deploy with local development or end-to-end test credentials.

## Public Routes

Confirm these routes render as public SEO pages:

- `/`
- `/about`
- `/services`
- `/comparator-sourcing`
- `/onboarding`
- `/contact`

Confirm public metadata uses the production domain by checking canonical and
OpenGraph URLs after `NEXT_PUBLIC_SITE_URL` is set.

Confirm the public marketing sitemap contains only:

- `/`
- `/about`
- `/services`
- `/comparator-sourcing`
- `/onboarding`
- `/contact`

## Internal Routes

- `/dashboard` redirects unauthenticated users to
  `/login?next=%2Fdashboard`.
- `/dashboard/*` child routes also redirect unauthenticated users to `/login`.
- `/login` remains public so internal users can authenticate.
- Authenticated users can open `/dashboard`, `/dashboard/setup`, and
  `/dashboard/setup/diagnostics`.

If the internal dashboard should not be generally reachable from the internet,
add hosting-level controls such as VPN, IP allowlisting, SSO gateway, or a
private network in front of the app. The application middleware enforces session
auth for dashboard routes but does not replace network access policy.

## API Configuration

- Use `INTERNAL_API_BASE_URL` for production dashboard traffic.
- Do not rely on `NEXT_PUBLIC_INTERNAL_API_BASE_URL` in production.
- The web helper fails clearly in production when `INTERNAL_API_BASE_URL` is
  missing, instead of silently calling localhost.
- Keep the API `/api` base URL reachable from the web server runtime.

## SEO And Crawling

- `app/sitemap.ts` includes only public pages.
- `app/robots.ts` disallows `/login`, `/dashboard`, and `/dashboard/*`.
- `/login` exports `noindex,nofollow` metadata.
- Do not add dashboard, setup, diagnostics, import, review, inbox, or account
  opening routes to the sitemap.
- Public pages should remain static and metadata-led where possible.
- Do not add `/dashboard` links to the public header, footer, sitemap, robots
  allowlist, or structured data.

## Public Content Launch Gates

Before launch, confirm:

- [ ] No placeholder copy remains in public UI, metadata, footer, structured
      data, generated sitemap, or generated robots output.
- [ ] No unverified compliance claims are present.
- [ ] No unverified facility/logistics claims are present, including
      warehousing, cold-chain, stockholding, 3PL, fulfilment, or operating-site
      claims.
- [ ] No fake accreditations, client logos, testimonials, awards, statistics,
      founding dates, years of experience, or legal identifiers are present.
- [ ] Privacy policy, cookie notice, legal footer, and terms decision is
      confirmed. Do not add placeholder legal pages or broken legal links.
- [ ] Public email and phone are confirmed for production:
      `info@ambemedical.com` and `+44 (0)1732 760900`.
- [ ] Production domain is confirmed and `NEXT_PUBLIC_SITE_URL` matches the
      canonical origin.
- [ ] Mobile header and footer have been checked on phone-sized viewport.
- [ ] `pnpm --filter @ambe/web build` passes.

## Legal And Company Detail TODOs

Do not add these to public copy until approved source material is available:

- Legal entity name for public display.
- Company number or legal identifiers.
- Registered office or operating address.
- MHRA/WDA/licence wording.
- Regulator, accreditation, or approval wording.
- Warehousing, cold-chain, stockholding, 3PL, fulfilment, or operating-site
  wording.
- Privacy policy, cookie notice, terms, or legal footer links.

## Final Human Checks

- Confirm DNS and TLS for `ambemedical.com`.
- Confirm whether `www.ambemedical.com` should redirect to the apex domain.
- Confirm public legal pages, privacy policy, and cookie notice requirements.
- Confirm any public licence, address, warehousing, cold-chain, stockholding, or
  3PL statements before adding them.
- Confirm `/login` remains noindex and `/dashboard` remains absent from the
  public sitemap.
- Confirm the public footer has no broken links and keeps Staff Login low
  prominence.
