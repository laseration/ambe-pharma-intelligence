import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import type {
  AccountOpeningCompletedFormFilingPack,
  AccountOpeningDriveArchiveConfig,
} from '../driveArchive';
import type { AccountOpeningCompletionDraft } from '../draft';
import {
  approveAccountOpeningCompletedFormFiling,
  buildAccountOpeningCase,
  buildAccountOpeningCaseDetail,
  detectAccountOpeningEmail,
  downloadAccountOpeningBinaryFillPreviewFile,
  downloadAccountOpeningFillPreviewFile,
  fileAccountOpeningCompletedFormToSharePoint,
  generateAccountOpeningBinaryFillPreview,
  generateAccountOpeningDraft,
  generateAccountOpeningFillPreview,
  getAccountOpeningReadinessReport,
  saveAccountOpeningFieldMappings,
  type AccountOpeningCaseEventInput,
  type AccountOpeningCaseRepository,
  type AccountOpeningReadinessReport,
  type PersistedAccountOpeningBinaryFillPreview,
  type PersistedAccountOpeningCaseEvent,
  type PersistedAccountOpeningCompletedFormFiling,
  type PersistedAccountOpeningFillPreview,
  type PersistedAccountOpeningOriginalForm,
  type PersistedAccountOpeningReviewCase,
} from '../service';

const FAKE_SENDER = 'demo.supplier@example.test';
const FAKE_SUBJECT = 'Account opening form for AMBE Medical Group';
const FAKE_BODY = `Hello,

Please complete the attached account-opening form for our records.

The form includes company details, trading address, VAT number, contact details, payment preference, and signature sections.

Please leave Direct Debit and bank authority sections blank for this demo.

Regards,
Demo Supplier`;

const SAFE_FIELD_MAPPINGS = [
  ['Legal company name', 'legalCompanyName'],
  ['Trading name', 'tradingName'],
  ['Company number', 'companyNumber'],
  ['VAT number', 'vatNumber'],
  ['Registered address', 'registeredAddress'],
  ['Trading address', 'tradingAddress'],
  ['Main contact name', 'mainContactName'],
  ['Main contact email', 'mainContactEmail'],
  ['Main contact phone', 'mainContactPhone'],
  ['Website', 'website'],
  ['Business hours', 'businessHours'],
] as const;

const RISKY_FIELDS = [
  ['Signature', 'signature'],
  ['Director signature', 'signature'],
  ['Direct Debit mandate', 'directDebitOrBankAuthority'],
  ['Bank account number', 'bankDetails'],
  ['Sort code', 'bankDetails'],
  ['Bank authority', 'directDebitOrBankAuthority'],
  ['Personal guarantee', 'guaranteeIndemnityDirectorOnly'],
  ['Indemnity', 'guaranteeIndemnityDirectorOnly'],
  ['Responsible Person', 'responsiblePerson'],
  ['WDA GDP declaration', 'wholesaleDealerAuthorisation'],
] as const;

const DEMO_STORAGE_CONFIG: AccountOpeningDriveArchiveConfig = {
  provider: 'SHAREPOINT',
  enabled: true,
  siteId: 'demo-site-id',
  driveId: 'demo-drive-id',
  rootFolder: 'Demo',
  baseFolder: 'Account Opening Demo',
  graphAuthConfigured: true,
};

function iso(value: string): Date {
  return new Date(value);
}

function logStep(
  rows: Array<{ step: string; status: string; detail: string }>,
  step: string,
  status: string,
  detail: string,
) {
  rows.push({ step, status, detail });
}

function assertDemo(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Demo assertion failed: ${message}`);
  }
}

async function createDemoPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const form = document.getForm();
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const regular = await document.embedFont(StandardFonts.Helvetica);

  page.drawText('DEMO SUPPLIER ACCOUNT OPENING FORM', {
    x: 48,
    y: 742,
    size: 18,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText('Fake AcroForm for local testing only', {
    x: 48,
    y: 718,
    size: 11,
    font: regular,
    color: rgb(0.35, 0.35, 0.35),
  });
  page.drawText(
    'No real supplier, customer, bank, signature, or submission data.',
    {
      x: 48,
      y: 698,
      size: 10,
      font: regular,
      color: rgb(0.55, 0.05, 0.05),
    },
  );

  const fields = [...SAFE_FIELD_MAPPINGS, ...RISKY_FIELDS].map(
    ([label]) => label,
  );
  fields.forEach((label, index) => {
    const column = index > 10 ? 1 : 0;
    const row = column === 0 ? index : index - 11;
    const x = column === 0 ? 48 : 330;
    const y = 660 - row * 48;
    page.drawText(label, {
      x,
      y: y + 24,
      size: 9,
      font: regular,
      color: rgb(0.1, 0.1, 0.1),
    });
    const field = form.createTextField(label);
    field.addToPage(page, {
      x,
      y,
      width: 220,
      height: 20,
      borderWidth: 1,
      borderColor: rgb(0.45, 0.45, 0.45),
      textColor: rgb(0.05, 0.05, 0.05),
    });
  });

  return document.save();
}

function buildInitialCase(
  pdfBytes: Uint8Array,
): PersistedAccountOpeningReviewCase {
  const accountCase = buildAccountOpeningCase({
    senderEmail: FAKE_SENDER,
    senderDomain: 'example.test',
    subject: FAKE_SUBJECT,
    bodyText: FAKE_BODY,
    receivedAt: iso('2026-05-18T09:00:00.000Z'),
    attachments: [
      {
        fileName: 'demo-account-opening-form.pdf',
        extractedText:
          'DEMO SUPPLIER ACCOUNT OPENING FORM. Company details, trading address, VAT number, contact details, payment preference, signature sections, Direct Debit mandate, bank authority, guarantee, indemnity, Responsible Person, WDA GDP declaration.',
      },
    ],
    sourceEvidence: [
      {
        sourceType: 'EMAIL_BODY',
        sourceLabel: 'Fake demo email',
        text: FAKE_BODY,
        rawFileAvailable: false,
      },
      {
        sourceType: 'ATTACHMENT',
        sourceLabel: 'Fake demo PDF AcroForm',
        fileName: 'demo-account-opening-form.pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdfBytes.byteLength,
        text: 'Fake demo AcroForm metadata only. Risk sections are detected but must remain blank.',
        rawFileAvailable: true,
        storageProvider: 'LOCAL_DEMO',
        storageFolderUrl: null,
        storageFileUrl: null,
        storageDriveItemId: 'local-demo-form',
      },
    ],
  });

  return {
    id: 'demo-account-opening-case',
    sourceFingerprint: accountCase.sourceFingerprint,
    messageId: '<demo-account-opening-message@example.test>',
    senderEmail: FAKE_SENDER,
    senderDomain: 'example.test',
    subject: FAKE_SUBJECT,
    receivedAt: iso('2026-05-18T09:00:00.000Z'),
    companyName: accountCase.detectedCompanyOrSupplierName,
    detectedFormType: 'account opening form',
    status: 'PENDING_REVIEW',
    recommendedSigner: accountCase.signingSummary.defaultSigner,
    signingStatement:
      'Aman Dhillon can sign this account-opening form by default.',
    signingExplanation: accountCase.signingSummary.signingExplanation,
    detectedNames: accountCase.signingSummary.detectedNames,
    detectedRoles: accountCase.signingSummary.detectedSignatureRoles,
    escalationNotes: accountCase.signingSummary.escalationNotes,
    riskFlags: accountCase.riskFlags,
    missingFields: accountCase.missingFields,
    reviewerChecks: accountCase.signingNotes.reviewerChecks,
    signingNotes: accountCase.signingNotes,
    missingInfoResponses: {
      website: 'https://www.ambe-demo.example.test',
      businessHours: 'Monday to Friday 09:00-17:00',
    },
    extractedTextSummary:
      'Fake demo account-opening email and AcroForm metadata only.',
    storageStatus: null,
    storageNote: null,
    storageSkippedReason: null,
    storageLastAttemptAt: null,
    storageFolderUrl: null,
    sourceAttachmentNames: ['demo-account-opening-form.pdf'],
    draftStatus: null,
    draftVersion: null,
    draftGeneratedAt: null,
    draftJson: null,
    draftSummary: null,
    sourceEvidence: [],
    fieldMappings: [],
    originalForms: [
      {
        id: 'demo-original-form',
        accountOpeningCaseId: 'demo-account-opening-case',
        sourceEvidenceId: null,
        fileName: 'demo-account-opening-form.pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdfBytes.byteLength,
        fileHash: null,
        storageProvider: 'LOCAL_DEMO',
        storageFolderUrl: null,
        storageFileUrl: null,
        storageDriveItemId: 'local-demo-form',
        localBlobAvailable: true,
        formType: 'PDF',
        fillSupportStatus: 'PREVIEW_SUPPORTED',
        detectedFieldCount: SAFE_FIELD_MAPPINGS.length + RISKY_FIELDS.length,
        detectionSummary: {
          demoOnly: true,
          rawFileBytesStored: false,
          acroFormFieldCount: SAFE_FIELD_MAPPINGS.length + RISKY_FIELDS.length,
        },
        createdAt: iso('2026-05-18T09:00:00.000Z'),
        updatedAt: iso('2026-05-18T09:00:00.000Z'),
      },
    ],
    fillPreviews: [],
    binaryFillPreviews: [],
    completedFormFilings: [],
    createdAt: iso('2026-05-18T09:00:00.000Z'),
    updatedAt: iso('2026-05-18T09:00:00.000Z'),
  };
}

function createDemoRepository(initial: PersistedAccountOpeningReviewCase): {
  repository: AccountOpeningCaseRepository;
  events: AccountOpeningCaseEventInput[];
  getBinaryPreviews: () => PersistedAccountOpeningBinaryFillPreview[];
  getCompletedFilings: () => PersistedAccountOpeningCompletedFormFiling[];
} {
  let current = initial;
  let fieldMappings = initial.fieldMappings ?? [];
  let fillPreviews = initial.fillPreviews ?? [];
  let binaryFillPreviews = initial.binaryFillPreviews ?? [];
  let completedFormFilings = initial.completedFormFilings ?? [];
  const events: AccountOpeningCaseEventInput[] = [];

  function caseWithRelations(): PersistedAccountOpeningReviewCase {
    return {
      ...current,
      fieldMappings,
      fillPreviews: [...fillPreviews].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      ),
      binaryFillPreviews: [...binaryFillPreviews].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      ),
      completedFormFilings: [...completedFormFilings].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      ),
    };
  }

  const repository: AccountOpeningCaseRepository = {
    findUnique: async () => caseWithRelations(),
    update: async (args: unknown) => {
      const data =
        (args as { data?: Partial<PersistedAccountOpeningReviewCase> }).data ??
        {};
      current = {
        ...current,
        ...data,
        updatedAt: iso('2026-05-18T09:10:00.000Z'),
      };
      return caseWithRelations();
    },
    replaceFieldMappings: async ({ mappings }) => {
      fieldMappings = mappings.map((mapping, index) => ({
        ...mapping,
        id: `demo-field-mapping-${index + 1}`,
        sortOrder: index,
        createdAt: iso('2026-05-18T09:20:00.000Z'),
        updatedAt: iso('2026-05-18T09:20:00.000Z'),
      }));
      return fieldMappings;
    },
    createFillPreview: async ({ data }) => {
      const created: PersistedAccountOpeningFillPreview = {
        ...data,
        id: `demo-fill-preview-${fillPreviews.length + 1}`,
        createdAt: iso('2026-05-18T09:30:00.000Z'),
      };
      fillPreviews = [created, ...fillPreviews];
      return created;
    },
    createBinaryFillPreview: async ({ data }) => {
      const created: PersistedAccountOpeningBinaryFillPreview = {
        ...data,
        id: `demo-binary-fill-preview-${binaryFillPreviews.length + 1}`,
        createdAt: iso('2026-05-18T09:40:00.000Z'),
      };
      binaryFillPreviews = [created, ...binaryFillPreviews];
      return created;
    },
    findBinaryFillPreview: async ({ where }) =>
      binaryFillPreviews.find((preview) => preview.id === where.id) ?? null,
    findCompletedFormFiling: async ({ where }) =>
      completedFormFilings.find((filing) => {
        if (where?.id && filing.id !== where.id) {
          return false;
        }
        if (
          where?.accountOpeningCaseId &&
          filing.accountOpeningCaseId !== where.accountOpeningCaseId
        ) {
          return false;
        }
        if (
          where?.binaryFillPreviewId &&
          filing.binaryFillPreviewId !== where.binaryFillPreviewId
        ) {
          return false;
        }
        return true;
      }) ?? null,
    createCompletedFormFiling: async ({ data }) => {
      const created: PersistedAccountOpeningCompletedFormFiling = {
        ...data,
        id: `demo-completed-form-filing-${completedFormFilings.length + 1}`,
        createdAt: iso('2026-05-18T09:50:00.000Z'),
        updatedAt: iso('2026-05-18T09:50:00.000Z'),
      };
      completedFormFilings = [created, ...completedFormFilings];
      return created;
    },
    updateCompletedFormFiling: async ({ where, data }) => {
      let updated: PersistedAccountOpeningCompletedFormFiling | null = null;
      completedFormFilings = completedFormFilings.map((filing) => {
        if (filing.id !== where.id) {
          return filing;
        }

        updated = {
          ...filing,
          ...data,
          updatedAt: iso('2026-05-18T10:00:00.000Z'),
        };
        return updated;
      });

      if (!updated) {
        throw new Error('Demo completed form filing not found.');
      }

      return updated;
    },
    findEvents: async ({ where }) =>
      events
        .filter((event) => {
          if (event.accountOpeningCaseId !== where.accountOpeningCaseId) {
            return false;
          }
          return where.actionType
            ? event.actionType === where.actionType
            : true;
        })
        .map(
          (event, index): PersistedAccountOpeningCaseEvent => ({
            id: `demo-event-${index + 1}`,
            accountOpeningCaseId: event.accountOpeningCaseId,
            actionType: event.actionType,
            previousStatus: event.previousStatus ?? null,
            newStatus: event.newStatus ?? null,
            actorType: event.actorType ?? 'SYSTEM',
            actorIdentifier: event.actorIdentifier ?? null,
            note: event.note ?? null,
            metadata: event.metadata ?? null,
            createdAt: iso('2026-05-18T10:10:00.000Z'),
          }),
        ),
    createEvent: async ({ data }) => {
      events.push(data);
      return data;
    },
  };

  return {
    repository,
    events,
    getBinaryPreviews: () => binaryFillPreviews,
    getCompletedFilings: () => completedFormFilings,
  };
}

function demoMappings() {
  return [
    ...SAFE_FIELD_MAPPINGS.map(([supplierFieldLabel, mappedDraftFieldKey]) => ({
      supplierFieldLabel,
      sourceType: 'OPERATOR_CREATED' as const,
      mappedDraftFieldKey,
      status: 'MAPPED_SAFE' as const,
      operatorNote: 'Demo operator reviewed as low-risk account details.',
    })),
    ...RISKY_FIELDS.map(([supplierFieldLabel, mappedDraftFieldKey]) => ({
      supplierFieldLabel,
      sourceType: 'OPERATOR_CREATED' as const,
      mappedDraftFieldKey,
      status: 'BLOCKED' as const,
      operatorNote:
        'Demo safety rule: leave signature, bank, Direct Debit, guarantee, indemnity, and regulatory declaration fields blank.',
    })),
  ];
}

async function assertPdfFields(input: {
  originalBytes: Uint8Array;
  previewBytes: Uint8Array;
}) {
  const original = await PDFDocument.load(input.originalBytes);
  const preview = await PDFDocument.load(input.previewBytes);
  const originalFields = original.getForm().getFields();
  const previewForm = preview.getForm();
  const previewFields = previewForm.getFields();
  const safeValues = SAFE_FIELD_MAPPINGS.map(([field]) =>
    previewForm.getTextField(field).getText(),
  );
  const riskyValues = RISKY_FIELDS.map(([field]) =>
    previewForm.getTextField(field).getText(),
  );

  assertDemo(
    preview.getPageCount() === original.getPageCount(),
    'binary preview page count should be preserved',
  );
  assertDemo(
    previewFields.length === originalFields.length,
    'binary preview AcroForm field count should be preserved',
  );
  assertDemo(
    safeValues.some((value) => value && value.trim().length > 0),
    'at least one safe field should be filled',
  );
  assertDemo(
    riskyValues.every((value) => !value || value.trim() === ''),
    'risky fields should remain blank',
  );

  return {
    originalPageCount: original.getPageCount(),
    outputPageCount: preview.getPageCount(),
    originalFieldCount: originalFields.length,
    outputFieldCount: previewFields.length,
    filledSafeFields: safeValues.filter((value) => value?.trim()).length,
    blankRiskyFields: riskyValues.filter((value) => !value?.trim()).length,
  };
}

function assertNoDangerousEvents(events: AccountOpeningCaseEventInput[]) {
  const eventText = events.map((event) => event.actionType).join(' ');
  assertDemo(!/BUY|PURCHASE|ORDER/i.test(eventText), 'no buy/order events');
  assertDemo(
    !/SUPPLIER.*SENT|SUBMIT/i.test(eventText),
    'no sending/submission',
  );
  assertDemo(!/FORM_SIGNED|SIGNATURE/i.test(eventText), 'no signing event');
}

function printReadiness(readiness: AccountOpeningReadinessReport | null) {
  if (!readiness) {
    console.log('Readiness diagnostics: not available.');
    return;
  }

  console.log('\nReadiness diagnostics');
  console.table(
    readiness.checks.map((check) => ({
      check: check.label,
      status: check.status,
      value: check.value,
      blocker: check.blocker ?? '',
      nextAction: check.nextAction,
    })),
  );
  console.log(`Next action: ${readiness.nextAction}`);
}

async function main() {
  const rows: Array<{ step: string; status: string; detail: string }> = [];
  const apiRoot = process.cwd();
  const tmpDir = resolve(apiRoot, 'tmp');
  await mkdir(tmpDir, { recursive: true });

  const originalPdfBytes = await createDemoPdf();
  const originalPdfPath = resolve(tmpDir, 'demo-account-opening-form.pdf');
  await writeFile(originalPdfPath, originalPdfBytes);

  const detection = detectAccountOpeningEmail({
    subject: FAKE_SUBJECT,
    bodyText: FAKE_BODY,
    attachmentFileNames: ['demo-account-opening-form.pdf'],
  });
  assertDemo(
    detection.detected,
    'fake account-opening email should be detected',
  );
  logStep(
    rows,
    'Detection',
    'PASS',
    `Detected account-opening terms: ${detection.matchedTerms.join(', ')}`,
  );

  const initialCase = buildInitialCase(originalPdfBytes);
  const duplicateCase = buildInitialCase(originalPdfBytes);
  assertDemo(
    duplicateCase.sourceFingerprint === initialCase.sourceFingerprint,
    'source fingerprint should be stable',
  );
  const { repository, events, getBinaryPreviews, getCompletedFilings } =
    createDemoRepository(initialCase);
  logStep(
    rows,
    'Durable case creation',
    'PASS',
    `Created in-memory demo case ${initialCase.id}; source evidence is metadata/safe snippets only.`,
  );

  const draftItem = await generateAccountOpeningDraft({
    id: initialCase.id,
    repository,
    actorType: 'OPERATOR',
    actorIdentifier: 'demo-operator',
  });
  assertDemo(draftItem.completionDraft.isStored, 'draft should be stored');
  assertDemo(
    draftItem.completionDraft.fields.some(
      (field) =>
        field.key === 'legalCompanyName' &&
        field.proposedValue?.includes('AMBE'),
    ),
    'draft should propose safe AMBE values',
  );
  assertDemo(
    draftItem.completionDraft.fields.some(
      (field) => field.key === 'signature' && field.riskLevel === 'BLOCKED',
    ),
    'signature fields should be blocked',
  );
  logStep(
    rows,
    'Draft generation',
    'PASS',
    `Stored draft status ${draftItem.completionDraft.status}; signature/bank/legal risk fields remain blocked or review-required.`,
  );

  const mappingReview = await saveAccountOpeningFieldMappings({
    id: initialCase.id,
    repository,
    mappings: demoMappings(),
    actorType: 'OPERATOR',
    actorIdentifier: 'demo-operator',
  });
  assertDemo(
    mappingReview.status === 'SAVED',
    'field mappings should be saved',
  );
  assertDemo(
    mappingReview.summary.mappedSafe > 0,
    'safe mappings should exist',
  );
  assertDemo(
    mappingReview.summary.blocked > 0,
    'risky mappings should be blocked',
  );
  logStep(
    rows,
    'Field mapping',
    'PASS',
    `${mappingReview.summary.mappedSafe} safe mappings, ${mappingReview.summary.blocked} blocked mappings.`,
  );

  const fillPreviewResult = await generateAccountOpeningFillPreview({
    id: initialCase.id,
    repository,
    actorType: 'OPERATOR',
    actorIdentifier: 'demo-operator',
  });
  const fillValuesFile = await downloadAccountOpeningFillPreviewFile({
    id: initialCase.id,
    fileName: 'fill-values.json',
    repository,
    actorType: 'OPERATOR',
    actorIdentifier: 'demo-operator',
  });
  const fillValuesText = fillValuesFile.content;
  assertDemo(
    fillPreviewResult.preview.payload.filledFields.length > 0,
    'fill-value preview should include safe fields',
  );
  assertDemo(
    !/12345678|12-34-56/.test(fillValuesText),
    'no bank values in preview',
  );
  assertDemo(
    fillPreviewResult.preview.metadata.sharePointCompletedFormFiled === false,
    'fill-value preview must not file to SharePoint',
  );
  logStep(
    rows,
    'Fill-value preview',
    'PASS',
    `${fillPreviewResult.preview.payload.filledFields.length} safe fill values; blocked fields remain blank.`,
  );

  const binaryPreviewResult = await generateAccountOpeningBinaryFillPreview({
    id: initialCase.id,
    repository,
    originalFormBytesLoader: async () => ({
      status: 'AVAILABLE',
      bytes: originalPdfBytes,
    }),
    actorType: 'OPERATOR',
    actorIdentifier: 'demo-operator',
  });
  assertDemo(
    binaryPreviewResult.preview.status === 'GENERATED_FOR_REVIEW',
    'binary preview should be generated for review',
  );
  assertDemo(
    binaryPreviewResult.preview.filledFieldCount > 0,
    'binary preview should fill safe fields',
  );
  const binaryPreviewFile = await downloadAccountOpeningBinaryFillPreviewFile({
    id: initialCase.id,
    fileName: 'binary-fill-preview.pdf',
    repository,
    actorType: 'OPERATOR',
    actorIdentifier: 'demo-operator',
  });
  const binaryPreviewPath = resolve(tmpDir, 'demo-binary-fill-preview.pdf');
  await writeFile(binaryPreviewPath, binaryPreviewFile.content);
  const pdfChecks = await assertPdfFields({
    originalBytes: originalPdfBytes,
    previewBytes: binaryPreviewFile.content,
  });
  logStep(
    rows,
    'Binary PDF AcroForm preview',
    'PASS',
    `${pdfChecks.filledSafeFields} safe fields filled; ${pdfChecks.blankRiskyFields} risky fields blank; pages ${pdfChecks.originalPageCount}/${pdfChecks.outputPageCount}; AcroFields ${pdfChecks.originalFieldCount}/${pdfChecks.outputFieldCount}.`,
  );

  const approvalResult = await approveAccountOpeningCompletedFormFiling({
    id: initialCase.id,
    repository,
    actorType: 'OPERATOR',
    actorIdentifier: 'demo-operator',
    approvalNote:
      'Demo operator approved completed unsigned form for internal filing only.',
  });
  assertDemo(
    approvalResult.filing.status === 'APPROVED_FOR_FILING',
    'completed unsigned form should be approved for filing',
  );
  assertDemo(
    events.some(
      (event) =>
        event.actionType === 'COMPLETED_UNSIGNED_FORM_APPROVED_FOR_FILING',
    ),
    'approval event should be recorded',
  );
  logStep(
    rows,
    'Approval for filing',
    'PASS',
    'Approved by fake operator demo-operator; no signing, sending, or submission.',
  );

  const uploadedPacks: AccountOpeningCompletedFormFilingPack[] = [];
  const filingResult = await fileAccountOpeningCompletedFormToSharePoint({
    id: initialCase.id,
    repository,
    actorType: 'OPERATOR',
    actorIdentifier: 'demo-operator',
    filingNote: 'Demo mock filing only.',
    storageConfig: DEMO_STORAGE_CONFIG,
    storageUploader: {
      uploadCompletedForm: async (pack) => {
        uploadedPacks.push(pack);
        return {
          folderUrl: 'https://sharepoint.example.test/demo-folder',
          fileUrl: 'https://sharepoint.example.test/demo-file.pdf',
          driveItemId: 'demo-drive-item',
        };
      },
    },
  });
  assertDemo(filingResult.filing.status === 'FILED', 'mock filing should file');
  const uploadedPack = uploadedPacks[0];
  assertDemo(uploadedPack, 'mock uploader should receive a filing pack');
  const uploadPackText = JSON.stringify(uploadedPack);
  assertDemo(
    uploadedPack.metadata.rawExtractedTextIncluded === false,
    'metadata should state raw extracted text is excluded',
  );
  assertDemo(!/12345678|12-34-56/.test(uploadPackText), 'no bank details');
  assertDemo(
    uploadedPack.metadata.notSigned,
    'upload metadata says not signed',
  );
  assertDemo(uploadedPack.metadata.notSent, 'upload metadata says not sent');
  assertDemo(
    uploadedPack.metadata.notSubmitted,
    'upload metadata says not submitted',
  );
  logStep(
    rows,
    'Mock SharePoint/Microsoft Drive filing',
    'PASS',
    `Mock-filed ${filingResult.filing.fileName}; no real Graph call was made.`,
  );

  const readiness = await getAccountOpeningReadinessReport({
    id: initialCase.id,
    repository,
    storageConfig: DEMO_STORAGE_CONFIG,
  });
  assertDemo(readiness, 'readiness report should be available');
  assertDemo(
    readiness.readyForEndToEndFillingAndFiling,
    'readiness should recognize the completed filed demo path',
  );
  logStep(
    rows,
    'Readiness diagnostics',
    'PASS',
    `Readiness ${readiness.status}; next action: ${readiness.nextAction}`,
  );

  assertNoDangerousEvents(events);
  assertDemo(getBinaryPreviews().length === 1, 'one binary preview expected');
  assertDemo(getCompletedFilings().length === 1, 'one filing record expected');
  assertDemo(
    mappingReview.summary.mappedSafe > 0,
    'persisted safe field mappings should be present',
  );

  console.log('\nAccount-opening full local demo');
  console.table(rows);
  printReadiness(readiness);
  console.log('\nDemo artifacts');
  console.log(`Original fake AcroForm: ${originalPdfPath}`);
  console.log(`Generated binary preview: ${binaryPreviewPath}`);
  console.log('\nSafety');
  console.log(
    'No signing, supplier sending, supplier submission, Direct Debit/bank authority completion, guarantee/indemnity/director-only completion, real bank details, or purchase/order/buy workflow side effects were performed.',
  );
  console.log('Storage mode: mock uploader; no real Microsoft Graph call.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
