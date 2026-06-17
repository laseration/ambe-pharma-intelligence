import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, isValidElement, type ReactNode } from 'react';

import { AccountOpeningCasesContent } from './AccountOpeningCasesContent';
import type { AccountOpeningCaseListResponse } from '@ambe/shared';

function collectText(node: ReactNode): string {
  const parts: string[] = [];

  function walk(value: ReactNode) {
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(String(value));
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (!isValidElement(value)) {
      return;
    }

    Children.forEach(
      (value as { props: { children?: ReactNode } }).props.children,
      walk,
    );
  }

  walk(node);
  return parts.join(' ');
}

const cases: AccountOpeningCaseListResponse = {
  total: 1,
  statusFilter: null,
  items: [
    {
      id: 'case-1',
      companyName: 'Example Supplier Ltd',
      counterpartyEmail: 'forms@supplier.test',
      counterpartyDomain: 'supplier.test',
      subject: 'Supplier account opening form',
      detectedFormType: 'supplier account application',
      caseTypeHint: 'SUPPLIER',
      status: 'PENDING_REVIEW',
      recommendedSigner: 'Aman Dhillon',
      riskFlagCount: 2,
      riskFlagLabels: ['Direct Debit mandate', 'Guarantee'],
      sourceChannel: 'EMAIL',
      receivedAt: '2026-05-12T09:00:00.000Z',
      createdAt: '2026-05-12T09:00:00.000Z',
      updatedAt: '2026-05-12T09:05:00.000Z',
    },
  ],
};

test('account-opening cases content renders safe read-only case rows', () => {
  const text = collectText(
    AccountOpeningCasesContent({ cases, filters: { status: '', q: '' } }),
  );

  assert.match(text, /Account Opening Cases/);
  // Read-only safety promise is surfaced to the operator.
  assert.match(text, /never signs, sends, or submits/i);
  assert.match(text, /Example Supplier Ltd/);
  assert.match(text, /Supplier onboarding/);
  assert.match(text, /Email \/ EML intake/);
  assert.match(text, /Pending review/);
  assert.match(text, /Aman Dhillon/);
  assert.match(text, /Direct Debit mandate/);
  assert.match(text, /Open case/);
  // No sensitive bank values appear in the list projection.
  assert.doesNotMatch(text, /12345678/);
  assert.doesNotMatch(text, /\d{2}-\d{2}-\d{2}/);
});

test('account-opening cases content shows an empty state noting manual create is coming', () => {
  const text = collectText(
    AccountOpeningCasesContent({
      cases: { total: 0, statusFilter: 'PENDING_REVIEW', items: [] },
      filters: { status: 'PENDING_REVIEW', q: '' },
    }),
  );

  assert.match(text, /No account-opening cases/);
  assert.match(text, /Manual case creation from the dashboard is coming/);
});
