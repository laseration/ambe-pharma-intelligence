import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachAccountOpeningCaseDocument,
  isAllowedAccountOpeningUpload,
  MAX_ACCOUNT_OPENING_UPLOAD_BYTES,
  type AttachAccountOpeningDocumentDeps,
} from '../documentUpload';
import type {
  AccountOpeningCaseDetail,
  AccountOpeningCaseEventInput,
  AccountOpeningSourceEvidenceInput,
} from '../service';

function fakeDetail(id: string): AccountOpeningCaseDetail {
  return {
    id,
    status: 'PENDING_REVIEW',
    companyName: 'Example Supplier Ltd',
  } as unknown as AccountOpeningCaseDetail;
}

type Captured = {
  evidence: Array<{
    caseId: string;
    evidence: AccountOpeningSourceEvidenceInput;
  }>;
  events: AccountOpeningCaseEventInput[];
};

function captureDeps(
  overrides: Partial<AttachAccountOpeningDocumentDeps> = {},
): {
  deps: AttachAccountOpeningDocumentDeps;
  captured: Captured;
} {
  const captured: Captured = { evidence: [], events: [] };
  const deps: AttachAccountOpeningDocumentDeps = {
    loadStatus: async () => 'PENDING_REVIEW',
    extractText: async () => ({
      method: 'PDF_TEXT',
      text: 'Supplier Account Opening Form. New account application for trade credit. Company registration number and VAT number requested.',
      warnings: [],
    }),
    persistEvidence: async (args) => {
      captured.evidence.push(args);
    },
    recordEvent: async (event) => {
      captured.events.push(event);
    },
    getDetail: async (id) => fakeDetail(id),
    fileToSharePoint: async () => ({
      status: 'SKIPPED_DISABLED',
      note: 'SharePoint filing disabled.',
      storageProvider: null,
      folderUrl: null,
      fileUrl: null,
      driveItemId: null,
      skippedReason: 'SharePoint filing disabled.',
      attemptedAt: new Date('2026-05-12T10:00:00.000Z'),
    }),
    ...overrides,
  };
  return { deps, captured };
}

function pdfFile(
  overrides: Partial<{
    fileName: string;
    mimeType: string | null;
    size: number;
  }> = {},
) {
  return {
    fileName: overrides.fileName ?? 'account-opening-form.pdf',
    mimeType:
      overrides.mimeType === undefined ? 'application/pdf' : overrides.mimeType,
    buffer: Buffer.from('fake-bytes'),
    size: overrides.size ?? 2048,
  };
}

test('isAllowedAccountOpeningUpload allows safe document types and blocks executables/scripts', () => {
  assert.equal(
    isAllowedAccountOpeningUpload('form.pdf', 'application/pdf'),
    true,
  );
  assert.equal(isAllowedAccountOpeningUpload('scan.PNG', 'image/png'), true);
  assert.equal(
    isAllowedAccountOpeningUpload(
      'list.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ),
    true,
  );
  assert.equal(
    isAllowedAccountOpeningUpload('malware.exe', 'application/x-msdownload'),
    false,
  );
  assert.equal(
    isAllowedAccountOpeningUpload('run.sh', 'application/x-sh'),
    false,
  );
});

test('attachAccountOpeningCaseDocument classifies an account-opening form and stores safe evidence + audit', async () => {
  const { deps, captured } = captureDeps();

  const result = await attachAccountOpeningCaseDocument(
    {
      caseId: 'case-1',
      file: pdfFile(),
      actorType: 'OPERATOR',
      actorIdentifier: 'operator-1',
    },
    deps,
  );

  assert.equal(result.classification.classification, 'ACCOUNT_OPENING_FORM');
  assert.equal(result.detail.id, 'case-1');

  // Evidence is metadata-only: ATTACHMENT, no raw bytes stored in the case.
  const ev = captured.evidence[0]!.evidence;
  assert.equal(ev.sourceType, 'ATTACHMENT');
  assert.equal(ev.fileName, 'account-opening-form.pdf');
  assert.equal(ev.rawFileAvailable, false);
  const meta = ev.metadata as Record<string, unknown>;
  assert.equal(meta.rawBytesStoredInCase, false);
  assert.equal(meta.classification, 'ACCOUNT_OPENING_FORM');

  // Audit event records the upload + operator.
  assert.equal(captured.events[0]?.actionType, 'DOCUMENT_UPLOADED');
  assert.equal(captured.events[0]?.actorType, 'OPERATOR');
  assert.equal(captured.events[0]?.actorIdentifier, 'operator-1');
});

test('attachAccountOpeningCaseDocument extracts a supplier name from the document text', async () => {
  const { deps, captured } = captureDeps({
    extractText: async () => ({
      method: 'PDF_TEXT',
      text: 'Account Opening Form. Supplier: Acme Pharma Ltd. Main contact: Jane Doe, jane@acmepharma.co.uk.',
      warnings: [],
    }),
  });

  const result = await attachAccountOpeningCaseDocument(
    { caseId: 'case-1', file: pdfFile() },
    deps,
  );

  assert.match(result.supplierNameCandidate ?? '', /Acme Pharma/i);
  // Candidate is stored on the evidence metadata for operator review (not
  // auto-applied to the case header).
  const meta = captured.evidence[0]!.evidence.metadata as Record<
    string,
    unknown
  >;
  assert.match(String(meta.supplierNameCandidate), /Acme Pharma/i);
});

test('attachAccountOpeningCaseDocument differentiates a price list from an account-opening form', async () => {
  const { deps } = captureDeps({
    extractText: async () => ({
      method: 'PDF_TEXT',
      text: 'Product price list. Unit price per pack. Pack size. Available stock quantity and lead time.',
      warnings: [],
    }),
  });

  const result = await attachAccountOpeningCaseDocument(
    {
      caseId: 'case-1',
      file: pdfFile({
        fileName: 'supplier-price-list.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    },
    deps,
  );

  // A price list must NOT be treated as an account-opening form.
  assert.notEqual(result.classification.classification, 'ACCOUNT_OPENING_FORM');
});

test('attachAccountOpeningCaseDocument rejects unsupported file types before any write', async () => {
  const { deps, captured } = captureDeps();

  await assert.rejects(
    () =>
      attachAccountOpeningCaseDocument(
        {
          caseId: 'case-1',
          file: {
            fileName: 'malware.exe',
            mimeType: 'application/x-msdownload',
            buffer: Buffer.from('MZ'),
            size: 10,
          },
        },
        deps,
      ),
    /unsupported file type/i,
  );
  assert.equal(captured.evidence.length, 0);
  assert.equal(captured.events.length, 0);
});

test('attachAccountOpeningCaseDocument rejects oversized files', async () => {
  const { deps } = captureDeps();
  await assert.rejects(
    () =>
      attachAccountOpeningCaseDocument(
        {
          caseId: 'case-1',
          file: pdfFile({ size: MAX_ACCOUNT_OPENING_UPLOAD_BYTES + 1 }),
        },
        deps,
      ),
    /10mb/i,
  );
});

test('attachAccountOpeningCaseDocument 404s for an unknown case and blocks terminal cases', async () => {
  const missing = captureDeps({ loadStatus: async () => null });
  await assert.rejects(
    () =>
      attachAccountOpeningCaseDocument(
        { caseId: 'nope', file: pdfFile() },
        missing.deps,
      ),
    /not found/i,
  );

  const rejected = captureDeps({ loadStatus: async () => 'REJECTED' });
  await assert.rejects(
    () =>
      attachAccountOpeningCaseDocument(
        { caseId: 'case-1', file: pdfFile() },
        rejected.deps,
      ),
    /rejected or closed/i,
  );
  assert.equal(rejected.captured.evidence.length, 0);
});

test('attachAccountOpeningCaseDocument files the uploaded document to SharePoint when enabled', async () => {
  const fileToSharePointCalls: Array<{ fileName: string; bytes: number }> = [];
  const { deps, captured } = captureDeps({
    fileToSharePoint: async (input) => {
      fileToSharePointCalls.push({
        fileName: input.file.fileName,
        bytes: input.file.content.length,
      });
      return {
        status: 'UPLOADED',
        note: 'Filed.',
        storageProvider: 'SHAREPOINT',
        folderUrl: 'https://sharepoint.example/folder',
        fileUrl: 'https://sharepoint.example/file.pdf',
        driveItemId: 'drive-item-1',
        skippedReason: null,
        attemptedAt: new Date('2026-05-12T10:00:00.000Z'),
      };
    },
  });

  const result = await attachAccountOpeningCaseDocument(
    { caseId: 'case-1', file: pdfFile() },
    deps,
  );

  assert.equal(result.sharePoint.status, 'UPLOADED');
  assert.equal(
    result.sharePoint.fileUrl,
    'https://sharepoint.example/file.pdf',
  );
  assert.equal(fileToSharePointCalls.length, 1);
  assert.equal(fileToSharePointCalls[0]?.fileName, 'account-opening-form.pdf');
  assert.ok((fileToSharePointCalls[0]?.bytes ?? 0) > 0);
  // The filing status is recorded on the audit event.
  const eventMeta = captured.events[0]?.metadata as Record<string, unknown>;
  assert.equal(eventMeta.sharePointStatus, 'UPLOADED');
});

test('attachAccountOpeningCaseDocument is a safe no-op for SharePoint when disabled', async () => {
  const { deps } = captureDeps(); // default fileToSharePoint => SKIPPED_DISABLED
  const result = await attachAccountOpeningCaseDocument(
    { caseId: 'case-1', file: pdfFile() },
    deps,
  );
  assert.equal(result.sharePoint.status, 'SKIPPED_DISABLED');
});
