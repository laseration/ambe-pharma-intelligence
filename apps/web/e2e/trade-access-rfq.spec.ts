import { expect, test } from '@playwright/test';

const qaRfq = {
  company: 'QA Trade Buyer Ltd',
  contact: 'QA Buyer',
  email: 'qa.trade.buyer@example.test',
  phone: '+44 20 0000 0100',
  businessType: 'Pharmacy',
  country: 'United Kingdom',
  product: 'QA Comparator Product 10mg tablets',
  strength: '10mg',
  packSize: '30 tablets',
  quantity: '120 packs',
  market: 'United Kingdom',
  requiredBy: '2026-06-20',
  notes: 'Automated QA RFQ - no patient data',
};

test('Trade Access RFQ appears in the protected dashboard and can be managed', async ({
  page,
}) => {
  await page.goto('/trade-access');

  await page.getByLabel('Company name').fill(qaRfq.company);
  await page.getByLabel('Contact name').fill(qaRfq.contact);
  await page.getByLabel('Business email').fill(qaRfq.email);
  await page.getByLabel('Phone').fill(qaRfq.phone);
  await page.getByLabel('Business type').fill(qaRfq.businessType);
  await page.getByLabel('Country').fill(qaRfq.country);
  await page
    .getByLabel('Product or comparator requirement')
    .fill(qaRfq.product);
  await page.getByLabel('Strength').fill(qaRfq.strength);
  await page.getByLabel('Pack size').fill(qaRfq.packSize);
  await page.getByLabel('Quantity').fill(qaRfq.quantity);
  await page.getByLabel('Target market').fill(qaRfq.market);
  await page.getByLabel('Required by').fill(qaRfq.requiredBy);
  await page.getByLabel('Documentation notes').fill(qaRfq.notes);
  await page.getByLabel('Additional context').fill(qaRfq.notes);
  await page.getByRole('button', { name: 'Submit requirement' }).click();

  await expect(
    page.getByText(
      'Requirement received. Ambe will review availability, pricing, timing, and documentation manually before any next step.',
    ),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText('patient data required');

  await page.goto('/dashboard/trade-enquiries');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Ftrade-enquiries$/);
  await page.getByLabel('Username').fill('pilot.operator');
  await page.getByLabel('Password').fill('local-e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Buyer RFQs' })).toBeVisible();
  await expect(page.getByRole('link', { name: qaRfq.company })).toBeVisible();
  await expect(page.getByText(qaRfq.product)).toBeVisible();
  await expect(page.getByText(qaRfq.quantity)).toBeVisible();

  await page.getByLabel('Status').selectOption('NEW');
  await page.getByLabel('Priority').selectOption('NORMAL');
  await page.getByLabel('Company').fill('QA Trade Buyer');
  await page.locator('input[name="createdFrom"]').fill('2026-06-07');
  await page.locator('input[name="createdTo"]').fill('2026-06-07');
  await page.getByRole('button', { name: 'Apply filters' }).click();

  await expect(page.getByRole('link', { name: qaRfq.company })).toBeVisible();
  await expect(page.getByText('Fixture Urgent Buyer Ltd')).not.toBeVisible();

  const detailPath = await page
    .getByRole('link', { name: qaRfq.company })
    .getAttribute('href');
  expect(detailPath).toBeTruthy();
  await page.goto(detailPath!);
  await expect(
    page.getByRole('heading', { name: qaRfq.company }),
  ).toBeVisible();
  await expect(page.getByText(qaRfq.contact)).toBeVisible();
  await expect(page.getByText(qaRfq.email)).toBeVisible();
  await expect(page.getByText(qaRfq.product)).toBeVisible();
  await expect(page.getByText(qaRfq.quantity)).toBeVisible();
  await expect(page.getByText('Status', { exact: true })).toBeVisible();
  await expect(page.getByText('Priority', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Internal review' }),
  ).toBeVisible();
  await expect(page.getByLabel('Internal review notes')).toBeVisible();

  await page.getByLabel('Next status').selectOption('REVIEWING');
  await page
    .getByLabel('Internal review notes')
    .fill('Automated QA dashboard review note.');
  await page.getByRole('button', { name: 'Update enquiry' }).click();

  await expect(page.getByText('Status updated to REVIEWING.')).toBeVisible();
  await expect(
    page.getByText('Automated QA dashboard review note.'),
  ).toBeVisible();
});
