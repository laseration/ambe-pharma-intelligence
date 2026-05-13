import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import express from 'express';

import { errorHandler } from '../../http/errors';
import { createAccountOpeningRouter } from '../routes';
import type { AccountOpeningCaseDetail, AccountOpeningMissingInfoResponses } from '../service';

function buildCaseDetail(overrides: Partial<AccountOpeningCaseDetail> = {}): AccountOpeningCaseDetail {
  return {
    id: 'case-1',
    sourceFingerprint: 'fingerprint-1',
    messageId: '<message-1>',
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    receivedAt: '2026-05-12T09:00:00.000Z',
    companyName: 'AMBE LTD',
    detectedFormType: 'account opening form',
    status: 'PENDING_REVIEW',
    recommendedSigner: 'Aman Dhillon',
    signingStatement: 'Aman Dhillon can sign this account-opening form by default.',
    signingExplanation: 'Aman Dhillon can sign this account-opening form by default.',
    detectedNames: [],
    detectedRoles: [],
    escalationNotes: [],
    riskFlags: ['Direct Debit mandate'],
    missingFields: ['companyNumber'],
    reviewerChecks: ['Leave all signature fields blank unless approved by a human reviewer.'],
    signingNotes: {
      title: 'Account opening signing notes',
      recommendedSigner: 'Aman Dhillon',
      defaultSigningStatement: 'Aman Dhillon can sign this account-opening form by default.',
      detectedNames: [],
      detectedRolesOrSections: [],
      reviewerChecks: ['Leave all signature fields blank unless approved by a human reviewer.'],
      riskFlags: ['Direct Debit mandate'],
      missingOrUnclear: ['companyNumber'],
      signatureInstruction: 'Leave signature fields blank until approved by a human reviewer.',
      summary:
        'Recommended signer: Aman Dhillon. Aman Dhillon can sign this account-opening form by default.',
    },
    missingInfoResponses: {},
    extractedTextSummary: 'Extracted account-opening text from attachments (120 chars).',
    sourceAttachmentNames: ['account-opening-form.pdf'],
    createdAt: '2026-05-12T09:00:00.000Z',
    updatedAt: '2026-05-12T09:05:00.000Z',
    ...overrides,
  };
}

async function startServer(context: TestContext, dependencies: Parameters<typeof createAccountOpeningRouter>[0]) {
  const app = express();
  app.use(express.json());
  app.use('/account-opening', createAccountOpeningRouter(dependencies));
  app.use(errorHandler);
  const server = app.listen(0);

  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

test('account-opening routes read a case without exposing raw form text fields', async (t) => {
  const baseUrl = await startServer(t, {
    getCaseDetail: async () => buildCaseDetail(),
    saveMissingInfo: async () => buildCaseDetail(),
    updateStatus: async () => buildCaseDetail(),
  });

  const response = await fetch(`${baseUrl}/account-opening/case-1`);
  const payload = (await response.json()) as { item: AccountOpeningCaseDetail };

  assert.equal(response.status, 200);
  assert.equal(payload.item.id, 'case-1');
  assert.equal(
    payload.item.signingNotes.defaultSigningStatement,
    'Aman Dhillon can sign this account-opening form by default.',
  );
  assert.equal('rawExtractedText' in payload.item, false);
});

test('account-opening missing-info route saves sanitized review fields with audit actor', async (t) => {
  const savedInputs: Array<{
    id: string;
    missingInfoResponses: AccountOpeningMissingInfoResponses;
    actorType?: string | null;
    actorIdentifier?: string | null;
  }> = [];
  const baseUrl = await startServer(t, {
    getCaseDetail: async () => buildCaseDetail(),
    saveMissingInfo: async (input) => {
      savedInputs.push(input);
      return buildCaseDetail({ missingInfoResponses: input.missingInfoResponses });
    },
    updateStatus: async () => buildCaseDetail(),
  });

  const response = await fetch(`${baseUrl}/account-opening/case-1/missing-info`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      website: 'https://supplier.example',
      reviewerNotes: 'Account number 12345678 should be redacted by the service.',
      actorType: 'OPERATOR',
      actorIdentifier: 'route-test',
    }),
  });
  const payload = (await response.json()) as { item: AccountOpeningCaseDetail };

  assert.equal(response.status, 200);
  const savedInput = savedInputs[0];
  assert.equal(savedInput?.id, 'case-1');
  assert.equal(savedInput?.actorType, 'OPERATOR');
  assert.equal(savedInput?.actorIdentifier, 'route-test');
  assert.equal(savedInput?.missingInfoResponses.website, 'https://supplier.example');
  assert.match(payload.item.missingInfoResponses.reviewerNotes ?? '', /Account number/);
});

test('account-opening status route allows only safe review status actions', async (t) => {
  const actions: string[] = [];
  const baseUrl = await startServer(t, {
    getCaseDetail: async () => buildCaseDetail(),
    saveMissingInfo: async () => buildCaseDetail(),
    updateStatus: async (input) => {
      actions.push(input.action);
      return buildCaseDetail({
        status:
          input.action === 'APPROVED_FOR_COMPLETION'
            ? 'APPROVED_FOR_COMPLETION'
            : input.action === 'REJECTED'
              ? 'REJECTED'
              : 'NEEDS_INFO',
      });
    },
  });

  const approveResponse = await fetch(`${baseUrl}/account-opening/case-1/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'APPROVED_FOR_COMPLETION',
      note: 'Approved for completion only. This does not sign or send.',
    }),
  });
  const rejectResponse = await fetch(`${baseUrl}/account-opening/case-1/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'REJECTED',
      note: 'No form will be completed, signed, uploaded, or sent.',
    }),
  });
  const unsafeResponse = await fetch(`${baseUrl}/account-opening/case-1/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'GENERATE_DRAFT',
    }),
  });

  assert.equal(approveResponse.status, 200);
  assert.equal(rejectResponse.status, 200);
  assert.equal(unsafeResponse.status, 422);
  assert.deepEqual(actions, ['APPROVED_FOR_COMPLETION', 'REJECTED']);
});
