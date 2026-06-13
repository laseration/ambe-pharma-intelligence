import { expect, type Page, test } from '@playwright/test';

import {
  createWebSessionCookieValue,
  WEB_AUTH_COOKIE_NAME,
  type WebAuthRole,
} from '../lib/internalWebAuth';

const webAuthSource = {
  WEB_AUTH_PASSWORD: 'local-e2e-password',
  WEB_AUTH_SESSION_SECRET: 'local-e2e-session-secret-that-is-long-enough',
  WEB_AUTH_SESSION_TTL_SECONDS: '3600',
  WEB_AUTH_USERNAME: 'pilot.operator',
};

const secretCanaries = [
  'postgresql://',
  'Bearer graph-token',
  'token=source-secret',
  'raw-worker-secret',
  'local-e2e-internal-api-key',
  'local-e2e-password',
  'local-e2e-session-secret-that-is-long-enough',
  'GRAPH_PAYLOAD_SHOULD_NOT_RENDER',
  'TELEGRAM_PAYLOAD_SHOULD_NOT_RENDER',
  'OPENAI_CONTENT_SHOULD_NOT_RENDER',
  'RAW_SOURCE_BODY_SHOULD_NOT_RENDER',
  'ATTACHMENT_CONTENT_SHOULD_NOT_RENDER',
  'pilot.supplier@example.test',
  'pilot.contact@example.test',
];

async function expectSecretCanariesHidden(page: Page) {
  for (const canary of secretCanaries) {
    await expect(page.locator('body')).not.toContainText(canary);
  }
}

async function setWebSession(page: Page, role: WebAuthRole) {
  const session = await createWebSessionCookieValue({
    username: `pilot.${role}`,
    role,
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

async function loginAsOperator(page: Page, next = '/dashboard') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Username').fill('pilot.operator');
  await page.getByLabel('Password').fill('local-e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('login succeeds for operator and invalid login keeps access blocked', async ({
  page,
}) => {
  await page.goto('/login?next=%2Fdashboard');
  await page.getByLabel('Username').fill('pilot.operator');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/login\?error=invalid&next=%2Fdashboard$/);
  await expect(page.getByText('Invalid username or password.')).toBeVisible();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);

  await loginAsOperator(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole('heading', { name: 'What needs doing next' }),
  ).toBeVisible();
  await expect(page.getByText('pilot.operator · operator')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Setup' })).toHaveCount(0);
});

test('unauthenticated dashboard access is redirected to login', async ({
  page,
}) => {
  await page.goto('/dashboard/review');

  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Freview$/);
  await expect(
    page.getByRole('heading', { name: 'Access Ambe Intelligence' }),
  ).toBeVisible();
});

test('admin setup and diagnostics render safe readiness without secret values', async ({
  page,
}) => {
  await setWebSession(page, 'admin');
  await page.goto('/dashboard/setup');

  await expect(
    page.getByRole('heading', { name: 'Pilot Setup Checklist' }),
  ).toBeVisible();

  for (const section of [
    'Database/API',
    'Internal API Auth',
    'Web Auth/Session',
    'Microsoft Graph Inbox Polling',
    'Allowed Senders/Supplier Mappings',
    'Microsoft Storage',
    'Telegram Intake',
    'OpenAI/AI Fallback Policy',
    'Import Availability',
    'Demo/Seed Safety',
    'Production Safety Warnings',
  ]) {
    await expect(page.getByText(section, { exact: true })).toBeVisible();
  }

  await expect(page.getByText('Polling Status')).toBeVisible();
  await expectSecretCanariesHidden(page);

  await page.goto('/dashboard/setup/diagnostics');
  await expect(
    page.getByRole('heading', { name: 'Operator-safe system checks' }),
  ).toBeVisible();
  await expect(page.getByText('Graph inbox preflight')).toBeVisible();
  await expect(page.getByText('Worker failure visibility')).toBeVisible();
  await expectSecretCanariesHidden(page);
});

test('operator cannot access admin-only setup but can open review queue', async ({
  page,
}) => {
  await setWebSession(page, 'operator');
  await page.goto('/dashboard');

  await expect(
    page.getByRole('heading', { name: 'What needs doing next' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Setup' })).toHaveCount(0);

  await page.goto('/dashboard/setup');
  await expect(
    page.getByRole('heading', { name: 'Pilot Setup Checklist' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'This page could not load safely' }),
  ).toBeVisible();

  await page.goto('/dashboard/review');
  await expect(
    page.getByRole('heading', { name: 'Supplier emails to check' }),
  ).toBeVisible();
  await expect(page.getByText('Commercial email reviews')).toBeVisible();
  await expectSecretCanariesHidden(page);
});

test('logout clears the session and blocks dashboard access again', async ({
  page,
}) => {
  await loginAsOperator(page);
  await expect(
    page.getByRole('heading', { name: 'What needs doing next' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login\?signedOut=1$/);
  await expect(page.getByText('You have been signed out.')).toBeVisible();

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});
