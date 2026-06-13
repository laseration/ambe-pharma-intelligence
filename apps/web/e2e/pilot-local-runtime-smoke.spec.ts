import { expect, type Page, test } from '@playwright/test';

import {
  createWebSessionCookieValue,
  WEB_AUTH_COOKIE_NAME,
} from '../lib/internalWebAuth';

const hiddenCanaries = [
  'LOCAL_RUNTIME_CORRECTED_RAW_TEXT_SHOULD_NOT_RENDER',
  'LOCAL_RUNTIME_CORRECTION_NOTE_SHOULD_NOT_RENDER',
  'LOCAL_RUNTIME_SCENARIO_RAW_TEXT_SHOULD_NOT_RENDER',
  'Demo data only. No real supplier or customer information.',
  'offers@northstar-demo.example.test',
  'buyer@citycare-demo.example.test',
  'postgresql://',
  'Bearer ',
  'local-runtime-e2e-admin-key',
  'local-runtime-e2e-internal-api-key',
  'local-runtime-e2e-password',
  'local-runtime-e2e-session-secret-that-is-long-enough',
  'GRAPH_PAYLOAD_SHOULD_NOT_RENDER',
  'TELEGRAM_PAYLOAD_SHOULD_NOT_RENDER',
];

const webAuthSource = {
  WEB_AUTH_PASSWORD: 'local-runtime-e2e-password',
  WEB_AUTH_SESSION_SECRET:
    'local-runtime-e2e-session-secret-that-is-long-enough',
  WEB_AUTH_SESSION_TTL_SECONDS: '3600',
  WEB_AUTH_USERNAME: 'pilot.operator',
};

async function setAdminSession(page: Page) {
  const session = await createWebSessionCookieValue({
    username: 'pilot.admin',
    role: 'admin',
    source: webAuthSource,
  });

  expect(session).not.toBeNull();

  await page.context().addCookies([
    {
      name: WEB_AUTH_COOKIE_NAME,
      value: session?.cookieValue ?? '',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
      expires: session?.session.expiresAt,
    },
  ]);
}

async function expectSensitiveCanariesHidden(page: Page) {
  for (const canary of hiddenCanaries) {
    await expect(page.locator('body')).not.toContainText(canary);
  }
}

test('pilot local-runtime smoke uses real API with disposable fake data', async ({
  page,
}) => {
  await page.goto('/dashboard/setup');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fsetup$/);
  await expect(
    page.getByRole('heading', { name: 'Access Ambe Intelligence' }),
  ).toBeVisible();

  await setAdminSession(page);
  await page.goto('/dashboard/setup');

  await expect(
    page.getByRole('heading', { name: 'Pilot Setup Checklist' }),
  ).toBeVisible();
  await expect(
    page.getByText('Internal API Auth', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Polling Status')).toBeVisible();
  await expectSensitiveCanariesHidden(page);

  await page.getByRole('link', { name: 'Diagnostics' }).click();
  await expect(
    page.getByRole('heading', { name: 'Operator-safe system checks' }),
  ).toBeVisible();
  await expect(page.getByText('Graph inbox preflight')).toBeVisible();
  await expect(page.getByText('Worker failure visibility')).toBeVisible();
  await expectSensitiveCanariesHidden(page);

  await page.goto('/dashboard/review');
  await expect(
    page.getByRole('heading', { name: 'Supplier emails to check' }),
  ).toBeVisible();
  await expect(page.getByText('Commercial email reviews')).toBeVisible();
  await expect(
    page.getByText('sender domain northstar-demo.example.test'),
  ).toBeVisible();
  await expect(page.getByText('FAKE DEMO supplier offer')).toBeVisible();
  await expect(
    page.getByText('FAKE DEMO scenario: Clean supplier offer ready for review'),
  ).toBeVisible();
  await expect(
    page.getByText('FAKE DEMO scenario: Ambiguous supplier'),
  ).toBeVisible();
  await expect(
    page.getByText('FAKE DEMO scenario: Blocked or restricted supplier'),
  ).toBeVisible();
  await expect(
    page.getByText('FAKE DEMO scenario: Missing price or currency'),
  ).toBeVisible();
  await expect(
    page.getByText('High MOQ requires operator review.'),
  ).toBeVisible();
  await expect(
    page.getByText('Blocked supplier must not be approved.'),
  ).toBeVisible();
  await expect(page.getByText('Approval required').first()).toBeVisible();
  await expectSensitiveCanariesHidden(page);

  await page.goto(
    '/dashboard/review/demo-pilot-inbound-email?returnTo=%2Fdashboard%2Freview',
  );
  await expect(
    page.getByRole('heading', { name: 'FAKE DEMO supplier offer' }),
  ).toBeVisible();
  await expect(page.getByText('Action readiness')).toBeVisible();
  await expect(
    page.getByText('Approval required before execution'),
  ).toBeVisible();

  await page.getByText('Source evidence summary').click();
  await expect(
    page.getByText(
      'Row-level source text is stored for traceability but hidden from the dashboard.',
    ),
  ).toBeVisible();

  await page.getByText('Prior corrections for this offer').click();
  await expect(page.getByText(/raw product text corrected/)).toBeVisible();
  await expect(page.getByText(/operator note recorded/)).toBeVisible();

  await expect(page.getByText('Audit History')).toBeVisible();
  await expect(page.getByText('Applied', { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      'Safe fake correction recorded for local-runtime browser smoke.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Original email')).toBeVisible();
  await expectSensitiveCanariesHidden(page);

  await page.goto(
    '/dashboard/review/demo-pilot-scenario-email-stale-correction?returnTo=%2Fdashboard%2Freview',
  );
  await expect(
    page.getByRole('heading', {
      name: 'FAKE DEMO scenario: Stale correction after approval',
    }),
  ).toBeVisible();
  const staleCorrectionOffer = page.locator('.offer-row-card').filter({
    hasText: 'Corrected after approval; review again',
  });
  const actionStatus = staleCorrectionOffer
    .locator('.action-state-card')
    .filter({
      has: page.getByRole('heading', { name: 'Action status' }),
    });
  await expect(
    actionStatus.getByText('Review again', { exact: true }),
  ).toBeVisible();
  await expect(
    actionStatus.getByText('Corrected after approval; review again', {
      exact: true,
    }),
  ).toBeVisible();
  await staleCorrectionOffer
    .getByText('Prior corrections for this offer', { exact: true })
    .click();
  await expect(
    staleCorrectionOffer.getByText(/raw product text corrected/),
  ).toBeVisible();
  await expectSensitiveCanariesHidden(page);

  await page.goto('/dashboard/deals');
  await expect(
    page.getByRole('heading', { name: 'Trade opportunities', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Fake scenario low margin; margin floor is not met.'),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Fake scenario near-expiry or expired stock risk; operator must confirm shelf-life before action.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Fake scenario dead stock / push opportunity; human approval still required before any outreach.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Buy ordered')).toBeVisible();
  await expectSensitiveCanariesHidden(page);
});
