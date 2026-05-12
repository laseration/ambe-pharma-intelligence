import {
  buildAccountOpeningArchiveFolderPath,
  createGraphSharePointArchiveUploader,
  getAccountOpeningSharePointArchiveConfig,
  getSharePointArchiveSkippedReason,
  redactAccountOpeningSensitiveText,
  type AccountOpeningArchivePack,
  type AccountOpeningSharePointArchiveConfig,
  type AccountOpeningSharePointArchiveUploader,
} from './sharePointArchive';
import type { AccountOpeningCompletedDraft } from './draftGeneration';
import type { AccountOpeningCaseDetail } from './service';

const MARKDOWN_DOCUMENT_FILE_NAME = 'completed-account-opening-draft.md';
const HTML_DOCUMENT_FILE_NAME = 'completed-account-opening-draft.html';
const DOCUMENT_FILE_NAMES = [MARKDOWN_DOCUMENT_FILE_NAME, HTML_DOCUMENT_FILE_NAME];
const SAFETY_FOOTER = 'Draft only — this has not been signed, sent, or submitted.';

export type AccountOpeningCompletedDraftDocument = {
  title: 'Account opening draft pack';
  status: 'DRAFT_ONLY';
  generatedAt: string;
  fileNames: string[];
  safetyFooter: typeof SAFETY_FOOTER;
  sharePointFolderUrl: string | null;
};

export type AccountOpeningDraftDocumentGenerationResult = {
  document: AccountOpeningCompletedDraftDocument;
  sharePointStatus: 'UPLOADED' | 'SKIPPED_DISABLED' | 'UPLOAD_FAILED';
  sharePointNote: string;
  sharePointSkippedReason: string | null;
  sharePointFolderUrl: string | null;
  sharePointLastAttemptAt: Date;
  packMetadata?: AccountOpeningArchivePack['metadata'];
};

function value(fields: Record<string, string>, key: string): string {
  return fields[key]?.trim() || 'To be confirmed';
}

function list(values: string[], fallback: string): string[] {
  return values.length > 0 ? values : [fallback];
}

function line(label: string, currentValue: string): string {
  return `- ${label}: ${currentValue}`;
}

function htmlEscape(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(item: AccountOpeningCaseDetail, draft: AccountOpeningCompletedDraft): string {
  const fields = draft.completedFields;
  const unresolvedFields = draft.unresolvedFields.map((field) => `${field.field}: ${field.value} (${field.reason})`);

  return redactAccountOpeningSensitiveText([
    '# Account opening draft pack',
    '',
    line('Case ID', item.id),
    line('Sender', item.senderEmail ?? 'To be confirmed'),
    line('Subject', item.subject ?? 'Account opening form'),
    line('Generated date', draft.generatedAt),
    line('Status', 'DRAFT ONLY'),
    '',
    '## AMBE company details',
    line('Registered company name', value(fields, 'registeredCompanyName')),
    line('Trading name', value(fields, 'tradingName')),
    line('Company number', value(fields, 'companyNumber')),
    line('VAT number', value(fields, 'vatNumber')),
    line('Legal status', value(fields, 'legalStatus')),
    line('Business type', value(fields, 'businessType')),
    line('Years trading', value(fields, 'yearsTrading')),
    '',
    '## Addresses',
    line('Registered address', value(fields, 'registeredAddress')),
    line('Invoice address', value(fields, 'invoiceAddress')),
    line('Accountants address', value(fields, 'accountantsAddress')),
    line('Licensed/delivery address', value(fields, 'licensedDeliveryAddress')),
    '',
    '## Contacts',
    line('Main/commercial contact', `${value(fields, 'commercialContactName')} (${value(fields, 'commercialContactEmail')})`),
    line('Accounts contact', `${value(fields, 'accountsContactName')} (${value(fields, 'accountsContactEmail')})`),
    line('Regulatory/RP contact', `${value(fields, 'regulatoryContactName')} (${value(fields, 'regulatoryContactEmail')})`),
    '',
    '## Regulatory details',
    line('MHRA/WDA number', value(fields, 'mhraWdaNumber')),
    line('WDA holder', value(fields, 'wdaHolder')),
    line('Licensed site address', value(fields, 'licensedSiteAddress')),
    line('Issue date', value(fields, 'wdaIssueDate')),
    line('Last inspection', value(fields, 'lastInspectionDate')),
    line('GPhC premises number', value(fields, 'gphcPremisesNumber')),
    line('CQC registration', value(fields, 'cqcRegistration')),
    '',
    '## Standard account answers',
    line('Preferred payment method', value(fields, 'preferredPaymentMethod')),
    line('Web ordering', value(fields, 'webOrdering')),
    line('Estimated monthly purchases', value(fields, 'estimatedMonthlyPurchases')),
    line('Saturday deliveries', value(fields, 'saturdayDeliveries')),
    line('Number of outlets', value(fields, 'numberOfOutlets')),
    line('Membership/order platform handling', value(fields, 'membershipOrderPlatformHandling')),
    line('Direct Debit requested', value(fields, 'directDebitRequested')),
    '',
    '## Signing notes',
    draft.signingNotes.defaultSigningStatement,
    draft.signingNotes.signatureInstruction,
    line('Recommended signer', draft.signingNotes.recommendedSigner),
    line('Signature fields', draft.signingNotes.signatureFields),
    '',
    '### Detected names',
    ...list(item.signingNotes.detectedNames, 'No detected names.').map((entry) => `- ${entry}`),
    '',
    '### Detected roles/sections',
    ...list(item.signingNotes.detectedRolesOrSections, 'No detected roles or sections.').map((entry) => `- ${entry}`),
    '',
    '### Reviewer checks',
    ...list(item.signingNotes.reviewerChecks, 'Review before approval.').map((entry) => `- ${entry}`),
    '',
    '### Risk flags',
    ...list(draft.riskFlags, 'No risk flags recorded.').map((entry) => `- ${entry}`),
    '',
    '## Missing/unresolved fields',
    ...list(unresolvedFields, 'No unresolved fields recorded.').map((entry) => `- ${entry}`),
    '',
    SAFETY_FOOTER,
  ].join('\n'));
}

function renderHtml(item: AccountOpeningCaseDetail, draft: AccountOpeningCompletedDraft): string {
  const markdown = renderMarkdown(item, draft);
  const lines = markdown.split('\n');
  const html = lines.map((currentLine) => {
    if (currentLine.startsWith('# ')) {
      return `<h1>${htmlEscape(currentLine.slice(2))}</h1>`;
    }
    if (currentLine.startsWith('## ')) {
      return `<h2>${htmlEscape(currentLine.slice(3))}</h2>`;
    }
    if (currentLine.startsWith('### ')) {
      return `<h3>${htmlEscape(currentLine.slice(4))}</h3>`;
    }
    if (currentLine.startsWith('- ')) {
      return `<p>${htmlEscape(currentLine)}</p>`;
    }
    return currentLine.trim() ? `<p>${htmlEscape(currentLine)}</p>` : '';
  }).join('\n');

  return redactAccountOpeningSensitiveText([
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<title>Account opening draft pack</title>',
    '</head>',
    '<body>',
    html,
    '</body>',
    '</html>',
  ].join('\n'));
}

export function buildAccountOpeningDraftDocumentPack(input: {
  item: AccountOpeningCaseDetail;
  draft: AccountOpeningCompletedDraft;
  config: AccountOpeningSharePointArchiveConfig;
  now?: Date;
}): AccountOpeningArchivePack {
  const now = input.now ?? new Date();
  const folderPath = buildAccountOpeningArchiveFolderPath(
    { ...input.item, status: 'APPROVED_FOR_COMPLETION' },
    input.config,
    now,
  );
  const files = [
    {
      fileName: MARKDOWN_DOCUMENT_FILE_NAME,
      contentType: 'text/markdown' as const,
      content: renderMarkdown(input.item, input.draft),
    },
    {
      fileName: HTML_DOCUMENT_FILE_NAME,
      contentType: 'text/html' as const,
      content: renderHtml(input.item, input.draft),
    },
  ];

  return {
    folderPath,
    files,
    metadata: {
      caseId: input.item.id,
      sourceFingerprint: input.item.sourceFingerprint,
      fileNames: files.map((file) => file.fileName),
      rawExtractedTextIncluded: false,
      signedFormsIncluded: false,
    },
  };
}

export async function generateAccountOpeningCompletedDraftDocument(input: {
  item: AccountOpeningCaseDetail;
  draft: AccountOpeningCompletedDraft;
  config?: AccountOpeningSharePointArchiveConfig;
  uploader?: AccountOpeningSharePointArchiveUploader;
  now?: Date;
}): Promise<AccountOpeningDraftDocumentGenerationResult> {
  const now = input.now ?? new Date();
  const config = input.config ?? getAccountOpeningSharePointArchiveConfig();
  const skippedReason = getSharePointArchiveSkippedReason(config);
  const document: AccountOpeningCompletedDraftDocument = {
    title: 'Account opening draft pack',
    status: 'DRAFT_ONLY',
    generatedAt: now.toISOString(),
    fileNames: [...DOCUMENT_FILE_NAMES],
    safetyFooter: SAFETY_FOOTER,
    sharePointFolderUrl: input.item.sharePointFolderUrl,
  };

  if (skippedReason) {
    return {
      document,
      sharePointStatus: 'SKIPPED_DISABLED',
      sharePointNote: `SharePoint completed draft document upload skipped: ${skippedReason}`,
      sharePointSkippedReason: skippedReason,
      sharePointFolderUrl: input.item.sharePointFolderUrl,
      sharePointLastAttemptAt: now,
    };
  }

  const pack = buildAccountOpeningDraftDocumentPack({
    item: input.item,
    draft: input.draft,
    config,
    now,
  });

  try {
    const result = await (input.uploader ?? createGraphSharePointArchiveUploader(config)).uploadArchivePack(pack);

    return {
      document: {
        ...document,
        sharePointFolderUrl: result.folderUrl,
      },
      sharePointStatus: 'UPLOADED',
      sharePointNote: `SharePoint completed draft documents uploaded: ${pack.metadata.fileNames.join(', ')}.`,
      sharePointSkippedReason: null,
      sharePointFolderUrl: result.folderUrl,
      sharePointLastAttemptAt: now,
      packMetadata: pack.metadata,
    };
  } catch (error) {
    return {
      document,
      sharePointStatus: 'UPLOAD_FAILED',
      sharePointNote: error instanceof Error ? error.message : 'SharePoint completed draft document upload failed.',
      sharePointSkippedReason: null,
      sharePointFolderUrl: input.item.sharePointFolderUrl,
      sharePointLastAttemptAt: now,
      packMetadata: pack.metadata,
    };
  }
}
