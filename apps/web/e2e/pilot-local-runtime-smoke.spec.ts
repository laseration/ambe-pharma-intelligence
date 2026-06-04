import { expect, type Page, test } from '@playwright/test';

const hiddenCanaries = [
  'LOCAL_RUNTIME_CORRECTED_RAW_TEXT_SHOULD_NOT_RENDER',
  'LOCAL_RUNTIME_CORRECTION_NOTE_SHOULD_NOT_RENDER',
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

async function expectSensitiveCanariesHidden(page: Page) {
  for (const canary of hiddenCanaries) {
    await expect(page.locator('body')).not.toContainText(canary);
  }
}

test('pilot local-runtime smoke uses real API with disposable fake data', async ({
  page,
}) => {
  await page.goto('/dashboard/setup');
  await expect(page).toHaveURL(/\/\?next=%2Fdashboard%2Fsetup$/);
  await expect(
    page.getByRole('heading', { name: 'Access Ambe Intelligence' }),
  ).toBeVisible();

  await page.getByLabel('Username').fill('pilot.operator');
  await page.getByLabel('Password').fill('local-runtime-e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(
    page.getByRole('heading', { name: 'Pilot Setup Checklist' }),
  ).toBeVisible();
  await expect(
    page.getByText('API Internal Auth', { exact: true }),
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
  await expect(page.getByText('Approval required')).toBeVisible();
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
  await expect(page.getByText('Applied')).toBeVisible();
  await expect(
    page.getByText(
      'Safe fake correction recorded for local-runtime browser smoke.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Original email')).toBeVisible();
  await expectSensitiveCanariesHidden(page);
});
