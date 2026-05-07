import { expect, test } from '@playwright/test';

test('Ambe web homepage loads', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Ambe Pharma Intelligence/);
  await expect(page.getByText('Open the Ambe operating dashboard.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue to dashboard' })).toBeVisible();

  await page.screenshot({ path: 'test-results/ambe-homepage.png', fullPage: true });
});

test('dashboard uses clear operator CTA text', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page.getByRole('link', { name: 'Open review queue' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open buying opportunities' }).first()).toBeVisible();
  await expect(page.getByText('It does not send emails or contact suppliers.')).toBeVisible();
});

test('inbox has no horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/inbox');

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );

  expect(hasHorizontalOverflow).toBe(false);
  await expect(page.getByRole('link', { name: 'Review this email' }).first()).toBeVisible();
});

test('review queue uses operator-facing labels', async ({ page }) => {
  await page.goto('/dashboard/review');

  await expect(page.getByRole('heading', { name: 'Supplier emails to check' })).toBeVisible();

  const hasReviewCard = await page.getByText('What was received').first().isVisible().catch(() => false);
  const hasEmptyState = await page.getByText('Nothing needs review right now.').isVisible().catch(() => false);

  expect(hasReviewCard || hasEmptyState).toBe(true);

  if (hasReviewCard) {
    await expect(page.getByText('Needs checking').first()).toBeVisible();
    await expect(page.getByText('What to do next').first()).toBeVisible();
  }
});
