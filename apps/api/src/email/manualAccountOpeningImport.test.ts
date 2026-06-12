import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildAccountOpeningCasePersistenceData,
  reprocessAccountOpeningCaseFromStoredSource,
  type AccountOpeningCaseEventInput,
  type AccountOpeningCasePersistenceInput,
  type AccountOpeningCaseRepository,
  type PersistedAccountOpeningOriginalForm,
  type PersistedAccountOpeningProcessingRun,
  type PersistedAccountOpeningReviewCase,
  type PersistedAccountOpeningSourceEvidence,
} from '../accountOpening/service';
import type { ReviewQueueItem } from '../reviewQueue/service';
import { createEmailInboundService } from './inbound/service';
import {
  importAccountOpeningEmlFile,
  MANUAL_ACCOUNT_OPENING_EML_SOURCE_SYSTEM,
  parseAccountOpeningEmlMessage,
} from './manualAccountOpeningImport';

const fakeFormBytes = Buffer.from(
  'fake sanitized account opening pdf bytes',
  'utf8',
);
const fakeGdpBytes = Buffer.from('fake sanitized gdp pdf bytes', 'utf8');

function buildSanitizedEmlFixture() {
  return Buffer.from(
    [
      'From: Fake Supplier Forms <forms@supplier.test>',
      'To: pilot@ambe.test',
      'Subject: Account opening form for AMBE pilot',
      'Message-ID: <manual-account-opening-fixture@example.test>',
      'Date: Fri, 12 Jun 2026 12:34:56 +0000',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="ambe-fixture-boundary"',
      '',
      '--ambe-fixture-boundary',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Please complete the attached account opening form for AMBE MEDICAL GROUP.',
      'The form includes Direct Debit, bank authority, signature, guarantee, indemnity, credit and GDP/WDA sections for manual review.',
      '',
      '--ambe-fixture-boundary',
      'Content-Type: application/pdf; name="fake-account-opening-form.pdf"',
      'Content-Disposition: attachment; filename="fake-account-opening-form.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      fakeFormBytes.toString('base64'),
      '',
      '--ambe-fixture-boundary',
      'Content-Type: application/pdf; name="fake-gdp-questionnaire.pdf"',
      'Content-Disposition: attachment; filename="fake-gdp-questionnaire.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      fakeGdpBytes.toString('base64'),
      '',
      '--ambe-fixture-boundary--',
      '',
    ].join('\r\n'),
    'utf8',
  );
}

function mapSourceEvidence(
  input: AccountOpeningCasePersistenceInput,
): PersistedAccountOpeningSourceEvidence[] {
  const now = new Date('2026-06-12T12:35:00.000Z');

  return input.accountCase.sourceEvidence.map((evidence, index) => ({
    id: `source-evidence-${index + 1}`,
    accountOpeningCaseId: 'manual-case-1',
    sourceType: evidence.sourceType,
    sourceLabel: evidence.sourceLabel ?? null,
    fileName: evidence.fileName ?? null,
    mimeType: evidence.mimeType ?? null,
    sizeBytes: evidence.sizeBytes ?? null,
    contentId: evidence.contentId ?? null,
    disposition: evidence.disposition ?? null,
    extractionMethod: evidence.extractionMethod ?? null,
    extractedTextHash: evidence.text
      ? createHash('sha256').update(evidence.text).digest('hex')
      : null,
    extractedTextChars: evidence.text?.length ?? null,
    safeSnippet: evidence.text?.slice(0, 240) ?? null,
    rawFileAvailable: evidence.rawFileAvailable ?? false,
    storageProvider: null,
    storageFolderUrl: null,
    storageFileUrl: null,
    storageDriveItemId: null,
    metadata: evidence.metadata ?? null,
    createdAt: now,
    updatedAt: now,
  }));
}

function createPersistedCase(
  input: AccountOpeningCasePersistenceInput,
): PersistedAccountOpeningReviewCase {
  const now = new Date('2026-06-12T12:35:00.000Z');
  const data = buildAccountOpeningCasePersistenceData(input).create;
  const sourceEvidence = mapSourceEvidence(input);
  const attachmentEvidenceCount = sourceEvidence.filter(
    (evidence) => evidence.sourceType === 'ATTACHMENT',
  ).length;

  return {
    id: 'manual-case-1',
    sourceFingerprint: data.sourceFingerprint,
    messageId: data.messageId,
    senderEmail: data.senderEmail,
    senderDomain: data.senderDomain,
    subject: data.subject,
    receivedAt: data.receivedAt,
    companyName: data.companyName,
    detectedFormType: data.detectedFormType,
    status: data.status,
    recommendedSigner: data.recommendedSigner,
    signingStatement: data.signingStatement,
    signingExplanation: data.signingExplanation,
    detectedNames: data.detectedNames,
    detectedRoles: data.detectedRoles,
    escalationNotes: data.escalationNotes,
    riskFlags: data.riskFlags,
    missingFields: data.missingFields,
    reviewerChecks: data.reviewerChecks,
    signingNotes: data.signingNotes,
    missingInfoResponses: data.missingInfoResponses,
    extractedTextSummary: data.extractedTextSummary,
    storageStatus: null,
    storageNote: null,
    storageSkippedReason: null,
    storageLastAttemptAt: null,
    storageFolderUrl: null,
    sourceAttachmentNames: data.sourceAttachmentNames,
    draftStatus: null,
    draftVersion: null,
    draftGeneratedAt: null,
    draftJson: null,
    draftSummary: null,
    sourceEvidence,
    fieldMappings: [],
    originalForms: [],
    fillPreviews: [],
    binaryFillPreviews: [],
    completedFormFilings: [],
    processingRuns: [
      {
        id: 'processing-run-initial',
        accountOpeningCaseId: 'manual-case-1',
        triggerType: 'INITIAL_INGEST',
        status: 'COMPLETED',
        startedAt: input.accountCase.receivedDate
          ? new Date(input.accountCase.receivedDate)
          : now,
        finishedAt: now,
        warningSummary: null,
        errorSummary: null,
        diagnostics: {
          sourceEvidenceCount: sourceEvidence.length,
          attachmentEvidenceCount,
          originalFormReferenceCount: 0,
          replaySource: 'STORED_SOURCE_EVIDENCE',
          rawEmailBodyRequired: false,
          rawExtractedTextStored: false,
          attachmentBytesStoredInCase: false,
          outboundActionsTriggered: false,
          approvalStatusChanged: false,
        },
        actorType: 'SYSTEM',
        actorIdentifier: 'manual-account-opening-eml-import-test',
        createdAt: now,
        updatedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function createReplayRepository(state: {
  current: PersistedAccountOpeningReviewCase;
  events: AccountOpeningCaseEventInput[];
}) {
  let originalFormSequence = 0;
  let processingRunSequence = 0;

  const repository: AccountOpeningCaseRepository = {
    findUnique: async () => state.current,
    update: async (args) => {
      const data = (
        args as {
          data: Partial<PersistedAccountOpeningReviewCase>;
        }
      ).data;
      state.current = {
        ...state.current,
        ...data,
        updatedAt: new Date('2026-06-12T12:36:00.000Z'),
      };
      return state.current;
    },
    replaceOriginalForms: async ({ forms }) => {
      state.current.originalForms = forms.map((form) => {
        originalFormSequence += 1;
        return {
          ...form,
          id: `original-form-${originalFormSequence}`,
          createdAt: new Date('2026-06-12T12:36:00.000Z'),
          updatedAt: new Date('2026-06-12T12:36:00.000Z'),
        };
      }) satisfies PersistedAccountOpeningOriginalForm[];
      return state.current.originalForms;
    },
    createProcessingRun: async ({ data }) => {
      processingRunSequence += 1;
      const run = {
        ...data,
        id: `processing-run-${processingRunSequence}`,
        createdAt: new Date('2026-06-12T12:36:00.000Z'),
        updatedAt: new Date('2026-06-12T12:36:00.000Z'),
      } satisfies PersistedAccountOpeningProcessingRun;
      state.current.processingRuns = [
        run,
        ...(state.current.processingRuns ?? []),
      ];
      return run;
    },
    updateProcessingRun: async ({ where, data }) => {
      const id = where.id;
      const run = state.current.processingRuns?.find((item) => item.id === id);

      if (!run) {
        throw new Error('Processing run not found.');
      }

      Object.assign(run, data, {
        updatedAt: new Date('2026-06-12T12:37:00.000Z'),
      });
      return run;
    },
    createEvent: async ({ data }) => {
      state.events.push(data);
      return data;
    },
  };

  return repository;
}

test('manual account-opening .eml parser preserves safe source provenance inputs', async () => {
  const message = await parseAccountOpeningEmlMessage({
    emlBytes: buildSanitizedEmlFixture(),
    fileName: 'sanitized-account-opening.eml',
  });

  assert.equal(message.sourceSystem, MANUAL_ACCOUNT_OPENING_EML_SOURCE_SYSTEM);
  assert.equal(message.from, 'forms@supplier.test');
  assert.equal(message.fromName, 'Fake Supplier Forms');
  assert.equal(message.subject, 'Account opening form for AMBE pilot');
  assert.equal(
    message.messageId,
    '<manual-account-opening-fixture@example.test>',
  );
  assert.equal(message.attachments?.length, 2);
  assert.deepEqual(
    message.attachments?.map((attachment) => ({
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
    })),
    [
      {
        fileName: 'fake-account-opening-form.pdf',
        mimeType: 'application/pdf',
        size: fakeFormBytes.byteLength,
      },
      {
        fileName: 'fake-gdp-questionnaire.pdf',
        mimeType: 'application/pdf',
        size: fakeGdpBytes.byteLength,
      },
    ],
  );
});

test('manual account-opening .eml import creates one replayable case and keeps risky fields blocked', async () => {
  let persistedInput: AccountOpeningCasePersistenceInput | null = null;
  const state: {
    current: PersistedAccountOpeningReviewCase | null;
    events: AccountOpeningCaseEventInput[];
  } = {
    current: null,
    events: [],
  };
  const service = createEmailInboundService({
    allowedSenders: ['forms@supplier.test'],
    isTrustedSender: () => true,
    importSupplierPriceList: async () => {
      throw new Error('supplier price import must not run');
    },
    importInventory: async () => {
      throw new Error('inventory import must not run');
    },
    importSales: async () => {
      throw new Error('sales import must not run');
    },
    parseUploadedFile: async () => ({
      rows: [],
      warnings: [],
      detectedColumns: [],
    }),
    parseTextMessage: async () => ({
      totalLines: 0,
      candidateLines: 0,
      parsedRows: [],
      skippedLines: [],
      overallConfidence: 'LOW',
      reviewRecommended: true,
      reviewRequired: true,
      aiFallbackAttempted: false,
      aiFallbackUsed: false,
      aiFallbackDecision: 'not_needed',
      rawBodyText: '',
      rawBody: '',
    }),
    extractAttachmentText: async (attachment) => ({
      method: 'PDF_TEXT',
      text:
        attachment.fileName === 'fake-gdp-questionnaire.pdf'
          ? 'Fake GDP questionnaire. Responsible Person RP GDP WDA regulatory declaration requires manual review.'
          : 'Fake account opening form. Signature date Direct Debit bank authority credit guarantee indemnity fields require manual review.',
      warnings: [],
    }),
    persistAccountOpeningCase: async (input) => {
      persistedInput = input;
      state.current = createPersistedCase(input);
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  });

  const result = await importAccountOpeningEmlFile({
    filePath: 'sanitized-account-opening.eml',
    dependencies: {
      readFile: async () => buildSanitizedEmlFixture(),
      ingestMessage: service.ingestMessage,
      findCaseByFingerprint: async () =>
        state.current
          ? {
              id: state.current.id,
              status: state.current.status,
              signingStatement: state.current.signingStatement,
              sourceFingerprint: state.current.sourceFingerprint,
            }
          : null,
      countBuyDecisions: async () => 10,
      countOfferWorkflowItems: async () => 20,
      listReviewQueueItems: async () => [
        {
          id: 'account-opening-manual-case-1',
          sourceType: 'ACCOUNT_OPENING',
        } as ReviewQueueItem,
      ],
    },
  });

  assert.ok(persistedInput);
  assert.equal(result.id, 'manual-case-1');
  assert.equal(result.attachmentCount, 2);
  assert.deepEqual(result.attachmentFileNames, [
    'fake-account-opening-form.pdf',
    'fake-gdp-questionnaire.pdf',
  ]);
  assert.equal(result.buyDecisionCountDelta, 0);
  assert.equal(result.offerWorkflowItemCountDelta, 0);
  assert.equal(result.safety.graphPollingEnabled, false);
  assert.equal(result.safety.outboundEmailSent, false);
  assert.equal(state.current?.sourceEvidence?.length, 3);

  const attachmentEvidence = state.current?.sourceEvidence?.filter(
    (evidence) => evidence.sourceType === 'ATTACHMENT',
  );

  assert.equal(attachmentEvidence?.length, 2);
  assert.ok(
    attachmentEvidence?.every(
      (evidence) =>
        evidence.rawFileAvailable === false &&
        (evidence.metadata as Record<string, unknown>).rawBytesStoredInCase ===
          false &&
        typeof (evidence.metadata as Record<string, unknown>)
          .attachmentChecksumSha256 === 'string',
    ),
  );

  const replayState = {
    current: state.current!,
    events: state.events,
  };
  const repository = createReplayRepository(replayState);
  const firstReplay = await reprocessAccountOpeningCaseFromStoredSource({
    id: 'manual-case-1',
    actorIdentifier: 'manual-eml-import-test',
    repository,
  });
  const secondReplay = await reprocessAccountOpeningCaseFromStoredSource({
    id: 'manual-case-1',
    actorIdentifier: 'manual-eml-import-test',
    repository,
  });

  assert.equal(firstReplay.originalForms.length, 2);
  assert.equal(secondReplay.originalForms.length, 2);
  assert.ok(
    secondReplay.processingRuns.some(
      (run) =>
        run.triggerType === 'INITIAL_INGEST' && run.status === 'COMPLETED',
    ),
  );
  assert.ok(
    secondReplay.processingRuns.some(
      (run) =>
        run.triggerType === 'MANUAL_REPROCESS' && run.status === 'COMPLETED',
    ),
  );
  assert.equal(secondReplay.completionDraft.summary.safeToAutoFill, false);
  assert.ok(secondReplay.completionDraft.summary.blockedFields >= 1);
  assert.ok(
    secondReplay.completionDraft.fields.some(
      (field) =>
        field.fieldClass === 'DIRECT_DEBIT' &&
        field.policyDecision === 'MUST_STAY_BLANK' &&
        field.proposedValue === null,
    ),
  );
  assert.ok(
    secondReplay.completionDraft.fields.some(
      (field) =>
        field.fieldClass === 'SIGNATURE' &&
        field.policyDecision === 'MUST_STAY_BLANK' &&
        field.proposedValue === null,
    ),
  );
});
