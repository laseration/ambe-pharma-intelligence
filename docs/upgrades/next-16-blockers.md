# Next 16 migration blockers

This repo has been held on the Next 15.x major line for the security-floor
upgrade. A later Next 16 migration should be handled as a separate framework
upgrade PR.

## Current repo state

- `apps/web` uses the App Router with `next.config.ts`.
- `apps/web/lib/serverWebAuth.ts` and `apps/web/app/auth/actions.ts` already
  call `await cookies()`.
- No `headers()` or `draftMode()` calls were found in `apps/web`.
- No custom `webpack` function was found in `apps/web/next.config.ts` or the web
  source tree.
- No explicit Turbopack configuration was found.
- Current scripts use `next dev` and `next build` without `--webpack`.

## Next 16 follow-up

- Validate the app on Next 16 with the current async request API usage; no
  synchronous `cookies()`, `headers()`, or `draftMode()` migration is currently
  indicated by the code search above.
- Next 16 makes Turbopack the default bundler. Because this repo has no custom
  webpack config, try the default Turbopack path first.
- If the production build fails under Turbopack, change only the migration PR's
  build script to `next build --webpack` while the incompatibility is isolated.
- Re-run the Playwright trade-access smoke because it covers the middleware
  login redirect, signed session cookie, and protected dashboard route.

Reference: https://nextjs.org/docs/app/guides/upgrading/version-16
