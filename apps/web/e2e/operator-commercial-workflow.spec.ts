import { expect, test } from '@playwright/test';

const inboundEmailId = 'e2e-operator-commercial-email';
const workflowId = 'e2e-operator-commercial-workflow';
const detailPath = `/dashboard/review/${inboundEmailId}`;
const completedDetailPath = `${detailPath}?showCompleted=1`;
const selfReturningDetailPath = `${detailPath}?returnTo=${encodeURIComponent(completedDetailPath)}`;
const apiPort = Number(process.env.PLAYWRIGHT_LOCAL_RUNTIME_API_PORT ?? 4411);
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api`;
const apiHeaders = {
  'x-internal-api-key': 'local-runtime-e2e-internal-api-key',
  'x-internal-caller-name': 'operator-commercial-e2e',
};
const adminApiHeaders = {
  'x-internal-api-key': 'local-runtime-e2e-admin-key',
  'x-internal-caller-name': 'operator-commercial-e2e-reset',
};

test('operator approves a staged offer and records buy execution', async ({
  page,
  request,
}) => {
  const resetResponse = await request.post(
    `${apiBaseUrl}/debug/e2e/operator-commercial-workflow/reset`,
    { headers: adminApiHeaders },
  );
  expect(resetResponse.ok()).toBeTruthy();

  await page.goto('/dashboard/review');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Freview$/);
  await page.getByLabel('Username').fill('pilot.operator');
  await page.getByLabel('Password').fill('local-runtime-e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(
    page.getByRole('heading', { name: 'Supplier emails to check' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: /E2E operator workflow staged supplier offer/,
    }),
  ).toBeVisible();

  await page.goto(selfReturningDetailPath);
  await expect(
    page.getByRole('heading', {
      name: 'E2E operator workflow staged supplier offer',
    }),
  ).toBeVisible();
  await expect(
    page
      .locator('.offer-row-title')
      .filter({ hasText: 'E2E Atorvastatin 20mg Tablets 28' }),
  ).toBeVisible();
  await expect(
    page.getByText('Approval required before execution'),
  ).toBeVisible();

  await page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Approve all' }) })
    .getByLabel('Note')
    .fill('E2E operator approved staged supplier offer.');
  await page.getByRole('button', { name: 'Approve all' }).click();

  await expect(page).toHaveURL(/showCompleted=1/);
  await expect(
    page.getByText('Approved. A buy decision was created.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('Buy decision', { exact: true })).toBeVisible();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();

  const auditAfterApproval = await request.get(
    `${apiBaseUrl}/review-queue/workflows/${workflowId}/audit-history`,
    { headers: apiHeaders },
  );
  expect(auditAfterApproval.ok()).toBeTruthy();
  const approvalAuditPayload = (await auditAfterApproval.json()) as {
    items: Array<{ entityType: string; actionType: string }>;
  };
  expect(
    approvalAuditPayload.items.some(
      (item) =>
        item.entityType === 'BUY_DECISION' && item.actionType === 'CREATED',
    ),
  ).toBeTruthy();

  const markOrdered = page.getByTestId(`mark-ordered-${workflowId}`);
  await expect(markOrdered).toBeVisible();
  await markOrdered
    .getByLabel('Purchase order reference')
    .fill('E2E-PO-2026-001');
  await markOrdered.getByLabel('Ordered quantity').fill('60');
  await markOrdered.getByLabel('Ordered unit price').fill('4.75');
  await markOrdered.getByLabel('Currency').fill('GBP');
  await markOrdered.getByLabel('Expected delivery date').fill('2026-06-20');
  await markOrdered
    .getByLabel('Execution note')
    .fill('E2E operator recorded internal order placement.');
  await markOrdered.getByLabel('Availability confirmed internally').check();
  await markOrdered.getByRole('button', { name: 'Mark ordered' }).click();

  await expect(page).toHaveURL(/showCompleted=1/);
  await expect(
    page.getByText('Marked ordered. Buy execution was created or updated.'),
  ).toBeVisible();
  await expect(
    page
      .locator('#decision')
      .getByText('Already executed', { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText('Execution', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('Marked Ordered', { exact: true }).first(),
  ).toBeVisible();

  const auditAfterExecution = await request.get(
    `${apiBaseUrl}/review-queue/workflows/${workflowId}/audit-history`,
    { headers: apiHeaders },
  );
  expect(auditAfterExecution.ok()).toBeTruthy();
  const executionAuditPayload = (await auditAfterExecution.json()) as {
    items: Array<{
      entityType: string;
      actionType: string;
      newStatus: string | null;
    }>;
  };

  expect(
    executionAuditPayload.items.some(
      (item) =>
        item.entityType === 'BUY_EXECUTION' &&
        item.actionType === 'ORDER_PLACED' &&
        item.newStatus?.includes('ORDER_PLACED'),
    ),
  ).toBeTruthy();
});
