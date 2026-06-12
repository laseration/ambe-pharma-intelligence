import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, isValidElement, type ReactNode } from 'react';

import type { AccountOpeningCaseDetail } from './accountOpeningApi';
import { AccountOpeningSafetyReviewSections } from '../app/dashboard/account-opening/[id]/SafetyReviewSections';

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

test('account-opening safety review sections expose risk flags and signatory routing notes', () => {
  const item = {
    policyRiskFlags: [
      {
        fieldKey: 'directDebitOrBankAuthority',
        supplierLabel: 'Direct Debit Mandate',
        fieldClass: 'DIRECT_DEBIT',
        policyDecision: 'MUST_STAY_BLANK',
        riskCategory: 'DIRECT_DEBIT',
        reason: 'Direct Debit mandate fields must stay blank.',
        signatoryRoutingNote:
          'Route to Sandeep Patel only if a Director signature, guarantee, bank mandate, or formal director authority is required.',
        signingNote:
          'Direct Debit mandates require separate human review and must not be completed by draft automation.',
      },
      {
        fieldKey: 'responsiblePerson',
        supplierLabel: 'Responsible Person declaration',
        fieldClass: 'REGULATORY_DECLARATION',
        policyDecision: 'MUST_STAY_BLANK',
        riskCategory: 'REGULATORY',
        reason: 'Regulatory declarations require review and must stay blank by default.',
        signatoryRoutingNote:
          'Route RP/GDP/WDA/regulatory declarations to Dilshad Moulana for review.',
        signingNote:
          'RP/GDP/WDA/regulatory declarations should be routed to Dilshad Moulana and left blank by default.',
      },
    ],
    policySigningNotes: [
      'Default signatory is Aman Dhillon for ordinary low-risk account-opening information.',
    ],
    completionDraft: {
      riskFlags: [],
      signingNotes: [],
    },
  } as unknown as AccountOpeningCaseDetail;

  const text = collectText(AccountOpeningSafetyReviewSections({ item }));

  assert.match(text, /Policy risk flags/);
  assert.match(text, /Direct Debit Mandate/);
  assert.match(text, /Responsible Person declaration/);
  assert.match(text, /Sandeep Patel/);
  assert.match(text, /Dilshad Moulana/);
  assert.match(text, /Aman Dhillon/);
  assert.match(text, /stay blank/i);
});
