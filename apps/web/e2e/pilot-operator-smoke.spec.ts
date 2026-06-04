import { expect, type Page, test } from '@playwright/test';

const hiddenCanaries = [
  'RAW_SOURCE_BODY_SHOULD_NOT_RENDER',
  'ATTACHMENT_CONTENT_SHOULD_NOT_RENDER',
  'CORRECTED_RAW_TEXT_SHOULD_NOT_RENDER',
  'CORRECTION_NOTE_SHOULD_NOT_RENDER',
  'GRAPH_PAYLOAD_SHOULD_NOT_RENDER',
  'TELEGRAM_PAYLOAD_SHOULD_NOT_RENDER',
  'postgresql://',
  'Bearer graph-token',
  'token=source-secret',
  'raw-worker-secret',
  'pilot.supplier@example.test',
  'pilot.contact@example.test',
];

async function expectSensitiveCanariesHidden(page: Page) {
  for (const canary of hiddenCanaries) {
    await expect(page.locator('body')).not.toContainText(canary);
  }
}

test('pilot operator walkthrough smoke uses sanitized browser paths', async ({
  page,
}) => {
  await page.goto('/dashboard/setup');
  await expect(page).toHaveURL(/\/\?next=%2Fdashboard%2Fsetup$/);
  await expect(
    page.getByRole('heading', { name: 'Access Ambe Intelligence' }),
  ).toBeVisible();

  await page.getByLabel('Username').fill('pilot.operator');
  await page.getByLabel('Password').fill('local-e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(
    page.getByRole('heading', { name: 'Pilot Setup Checklist' }),
  ).toBeVisible();
  await expect(page.getByText('Internal API', { exact: true })).toBeVisible();
  await expect(page.getByText('Polling Status')).toBeVisible();
  await expect(
    page.getByText('[redacted] [redacted] [redacted]'),
  ).toBeVisible();
  await expectSensitiveCanariesHidden(page);

  await page.getByRole('link', { name: 'Diagnostics' }).click();
  await expect(
    page.getByRole('heading', { name: 'Operator-safe system checks' }),
  ).toBeVisible();
  await expect(page.getByText('Graph inbox preflight')).toBeVisible();
  await expect(
    page.getByText('Fixture mode only; no mailbox calls are made.'),
  ).toBeVisible();
  await expect(page.getByText('Worker failure visibility')).toBeVisible();
  await expectSensitiveCanariesHidden(page);

  await page.goto('/dashboard/review');
  await expect(
    page.getByRole('heading', { name: 'Supplier emails to check' }),
  ).toBeVisible();
  await expect(page.getByText('Commercial email reviews')).toBeVisible();
  await expect(page.getByText('sender domain example.test')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Supplier risk (1)' }),
  ).toBeVisible();
  await expect(page.getByText('Approval required')).toHaveCount(2);
  await expectSensitiveCanariesHidden(page);

  await page.getByRole('link', { name: 'Supplier risk (1)' }).click();
  await expect(page).toHaveURL(/filter=supplier-risk/);
  await expect(page.getByText('Current filter')).toBeVisible();
  await expect(
    page.getByText('Blocked, restricted, or unknown supplier qualification.'),
  ).toBeVisible();
  await expect(page.getByText('Pilot sanitized supplier offer')).toBeVisible();
  await expectSensitiveCanariesHidden(page);

  await page.goto(
    '/dashboard/review/inbound-email-1?returnTo=%2Fdashboard%2Freview',
  );
  await expect(
    page.getByRole('heading', { name: 'Pilot sanitized supplier offer' }),
  ).toBeVisible();
  await expect(page.getByText('Action readiness')).toBeVisible();
  await expect(
    page.getByText('Corrected after approval; review again'),
  ).toHaveCount(3);
  await expect(page.getByRole('button', { name: /^Approve$/ })).toBeDisabled();

  await page.getByText('Source evidence summary').click();
  await expect(
    page.getByText(
      'Row-level source text is stored for traceability but hidden from the dashboard.',
    ),
  ).toBeVisible();

  await page.getByText('Prior corrections for this offer').click();
  await expect(page.getByText(/raw product text corrected/)).toHaveCount(2);
  await expect(page.getByText(/operator note recorded/)).toHaveCount(2);

  await expect(page.getByText('Audit History')).toBeVisible();
  await expect(page.getByText('Offer Corrected')).toBeVisible();
  await expect(
    page.getByText('Safe correction recorded for pilot walkthrough.'),
  ).toBeVisible();
  await expect(page.getByText('Original email')).toBeVisible();
  await expectSensitiveCanariesHidden(page);
});
