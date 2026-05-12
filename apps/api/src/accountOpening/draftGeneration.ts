import {
  AMBE_MASTER_ACCOUNT_OPENING_PROFILE,
  SECURE_REVIEW_REQUIRED,
  TO_BE_CONFIRMED,
} from './ambeMasterProfile';
import {
  buildAccountOpeningArchiveFolderPath,
  createGraphSharePointArchiveUploader,
  getAccountOpeningSharePointArchiveConfig,
  getSharePointArchiveSkippedReason,
  redactAccountOpeningSensitiveText,
  stringifyAccountOpeningSafeJson,
  type AccountOpeningArchivePack,
  type AccountOpeningSharePointArchiveConfig,
  type AccountOpeningSharePointArchiveUploader,
} from './sharePointArchive';
import type { AccountOpeningCaseDetail, AccountOpeningMissingInfoResponses } from './service';

export type AccountOpeningCompletedDraft = {
  caseId: string;
  status: string;
  generatedAt: string;
  companyProfileUsed: string;
  completedFields: Record<string, string>;
  unresolvedFields: Array<{
    field: string;
    value: 'To be confirmed' | 'To be confirmed in secure review';
    reason: string;
  }>;
  riskFlags: string[];
  signingNotes: {
    recommendedSigner: string;
    defaultSigningStatement: string;
    signatureInstruction: string;
    signatureFields: '';
  };
  reviewerWarnings: string[];
  outputStatus: 'DRAFT_ONLY';
};

export type AccountOpeningDraftGenerationResult = {
  draft: AccountOpeningCompletedDraft;
  sharePointStatus: 'UPLOADED' | 'SKIPPED_DISABLED' | 'UPLOAD_FAILED';
  sharePointNote: string;
  sharePointSkippedReason: string | null;
  sharePointFolderUrl: string | null;
  sharePointLastAttemptAt: Date;
  packMetadata?: AccountOpeningArchivePack['metadata'];
};

function responseValue(
  responses: AccountOpeningMissingInfoResponses,
  key: keyof AccountOpeningMissingInfoResponses,
): string | null {
  const value = responses[key]?.trim();
  return value ? redactAccountOpeningSensitiveText(value) : null;
}

function addField(
  fields: Record<string, string>,
  unresolved: AccountOpeningCompletedDraft['unresolvedFields'],
  field: string,
  value: string,
  reason = 'No reviewed value is available.',
): void {
  fields[field] = value;
  if (value === TO_BE_CONFIRMED || value === SECURE_REVIEW_REQUIRED) {
    unresolved.push({
      field,
      value,
      reason,
    });
  }
}

function buildReviewerWarnings(item: AccountOpeningCaseDetail): string[] {
  return Array.from(new Set([
    'Draft only — this has not been signed or sent.',
    'Leave signature fields blank until approved by a human reviewer.',
    ...item.signingNotes.reviewerChecks,
    ...item.riskFlags.map((riskFlag) => `Review risk flag before completion: ${riskFlag}.`),
  ]));
}

export function buildAccountOpeningCompletedDraft(
  item: AccountOpeningCaseDetail,
  generatedAt = new Date(),
): AccountOpeningCompletedDraft {
  const fields: Record<string, string> = {};
  const unresolved: AccountOpeningCompletedDraft['unresolvedFields'] = [];
  const profile = AMBE_MASTER_ACCOUNT_OPENING_PROFILE;
  const responses = item.missingInfoResponses;

  addField(fields, unresolved, 'registeredCompanyName', profile.registeredCompanyName);
  addField(fields, unresolved, 'tradingName', profile.tradingName);
  addField(fields, unresolved, 'companyNumber', profile.companyNumber);
  addField(fields, unresolved, 'vatNumber', profile.vatNumber);
  addField(fields, unresolved, 'legalStatus', profile.legalStatus);
  addField(fields, unresolved, 'businessType', profile.businessType);
  addField(fields, unresolved, 'yearsTrading', profile.yearsTrading);
  addField(fields, unresolved, 'registeredAddress', profile.registeredAddress);
  addField(fields, unresolved, 'invoiceAddress', profile.invoiceAddress);
  addField(fields, unresolved, 'accountantsAddress', profile.accountantsAddress);
  addField(fields, unresolved, 'licensedDeliveryAddress', profile.licensedDeliveryAddress);
  addField(fields, unresolved, 'website', responseValue(responses, 'website') ?? profile.standardAnswers.website);
  addField(
    fields,
    unresolved,
    'numberOfEmployees',
    responseValue(responses, 'numberOfEmployees') ?? profile.standardAnswers.numberOfEmployees,
  );
  addField(
    fields,
    unresolved,
    'businessHours',
    responseValue(responses, 'businessHours') ?? profile.standardAnswers.businessHours,
  );
  addField(
    fields,
    unresolved,
    'estimatedMonthlyPurchases',
    responseValue(responses, 'estimatedMonthlyPurchases') ?? profile.standardAnswers.estimatedMonthlyPurchases,
  );
  addField(fields, unresolved, 'webOrdering', responseValue(responses, 'webOrdering') ?? profile.standardAnswers.webOrdering);
  addField(fields, unresolved, 'saturdayDeliveries', profile.standardAnswers.saturdayDeliveries);
  addField(fields, unresolved, 'numberOfOutlets', profile.standardAnswers.numberOfOutlets);
  addField(
    fields,
    unresolved,
    'membershipOrderPlatformHandling',
    profile.standardAnswers.membershipOrderPlatformHandling,
  );
  addField(fields, unresolved, 'preferredPaymentMethod', profile.standardAnswers.paymentMethod);
  addField(
    fields,
    unresolved,
    'directDebitRequested',
    responseValue(responses, 'directDebitRequested') ?? profile.standardAnswers.directDebitRequested,
  );
  addField(fields, unresolved, 'bankDetails', profile.standardAnswers.bankDetails, 'Bank details require secure active review.');
  addField(
    fields,
    unresolved,
    'cdLicenceApplies',
    responseValue(responses, 'cdLicenceApplies') ?? profile.regulatory.cdLicenceApplies,
  );
  addField(
    fields,
    unresolved,
    'gphcPremisesNumber',
    responseValue(responses, 'gphcPremisesNumber') ?? profile.regulatory.gphcPremisesNumber,
  );
  addField(
    fields,
    unresolved,
    'cqcRegistration',
    responseValue(responses, 'cqcRegistration') ?? profile.regulatory.cqcRegistration,
  );
  addField(fields, unresolved, 'mhraWdaNumber', profile.regulatory.mhraWdaNumber);
  addField(fields, unresolved, 'wdaHolder', profile.regulatory.wdaHolder);
  addField(fields, unresolved, 'licensedSiteAddress', profile.regulatory.licensedSiteAddress);
  addField(fields, unresolved, 'wdaIssueDate', profile.regulatory.wdaIssueDate);
  addField(fields, unresolved, 'lastInspectionDate', profile.regulatory.lastInspectionDate);
  addField(fields, unresolved, 'responsiblePerson', profile.regulatory.responsiblePerson);
  addField(fields, unresolved, 'rpEmail', profile.regulatory.rpEmail);
  addField(fields, unresolved, 'commercialContactName', profile.contacts.generalCommercial.name);
  addField(fields, unresolved, 'commercialContactEmail', profile.contacts.generalCommercial.email);
  addField(fields, unresolved, 'accountsContactName', profile.contacts.accounts.name);
  addField(fields, unresolved, 'accountsContactEmail', profile.contacts.accounts.email);
  addField(fields, unresolved, 'regulatoryContactName', profile.contacts.regulatory.name);
  addField(fields, unresolved, 'regulatoryContactEmail', profile.contacts.regulatory.email);
  addField(fields, unresolved, 'recommendedSigner', profile.signingRules.defaultSigner);
  addField(fields, unresolved, 'signatureFields', profile.signingRules.signatureFields);

  return {
    caseId: item.id,
    status: item.status,
    generatedAt: generatedAt.toISOString(),
    companyProfileUsed: profile.companyProfileUsed,
    completedFields: fields,
    unresolvedFields: unresolved,
    riskFlags: item.riskFlags,
    signingNotes: {
      recommendedSigner: profile.signingRules.defaultSigner,
      defaultSigningStatement: profile.signingRules.defaultSigningStatement,
      signatureInstruction: profile.signingRules.signatureInstruction,
      signatureFields: profile.signingRules.signatureFields,
    },
    reviewerWarnings: buildReviewerWarnings(item),
    outputStatus: 'DRAFT_ONLY',
  };
}

export function buildAccountOpeningDraftPack(
  item: AccountOpeningCaseDetail,
  draft: AccountOpeningCompletedDraft,
  config: AccountOpeningSharePointArchiveConfig,
  now = new Date(),
): AccountOpeningArchivePack {
  const folderPath = buildAccountOpeningArchiveFolderPath(
    { ...item, status: 'APPROVED_FOR_COMPLETION' },
    config,
    now,
  );
  const fieldMappingSummary = {
    caseId: item.id,
    companyProfileUsed: draft.companyProfileUsed,
    sources: {
      masterProfile: 'AMBE master account-opening profile v1',
      missingInfoResponses: Object.keys(item.missingInfoResponses),
      extractedMetadata: ['senderEmail', 'senderDomain', 'subject', 'receivedAt', 'detectedFormType'],
      rawExtractedTextIncluded: false,
    },
    outputStatus: draft.outputStatus,
  };
  const unresolvedFields = {
    caseId: item.id,
    unresolvedFields: draft.unresolvedFields,
  };
  const draftText = [
    '# Account Opening Completed Form Draft',
    '',
    'Draft only — this has not been signed or sent.',
    draft.signingNotes.defaultSigningStatement,
    draft.signingNotes.signatureInstruction,
    '',
    '## Completed Fields',
    ...Object.entries(draft.completedFields).map(([field, value]) => `- ${field}: ${value}`),
    '',
    '## Unresolved Fields',
    ...draft.unresolvedFields.map((field) => `- ${field.field}: ${field.value} (${field.reason})`),
    '',
    '## Risk Flags',
    ...(draft.riskFlags.length ? draft.riskFlags.map((riskFlag) => `- ${riskFlag}`) : ['- None recorded']),
  ].join('\n');
  const files = [
    {
      fileName: 'completed-form-draft.json',
      contentType: 'application/json' as const,
      content: stringifyAccountOpeningSafeJson(draft),
    },
    {
      fileName: 'completed-form-draft.txt',
      contentType: 'text/plain' as const,
      content: redactAccountOpeningSensitiveText(draftText),
    },
    {
      fileName: 'field-mapping-summary.json',
      contentType: 'application/json' as const,
      content: stringifyAccountOpeningSafeJson(fieldMappingSummary),
    },
    {
      fileName: 'unresolved-fields.json',
      contentType: 'application/json' as const,
      content: stringifyAccountOpeningSafeJson(unresolvedFields),
    },
  ];

  return {
    folderPath,
    files,
    metadata: {
      caseId: item.id,
      sourceFingerprint: item.sourceFingerprint,
      fileNames: files.map((file) => file.fileName),
      rawExtractedTextIncluded: false,
      signedFormsIncluded: false,
    },
  };
}

export async function generateAccountOpeningCompletedDraft(input: {
  item: AccountOpeningCaseDetail;
  config?: AccountOpeningSharePointArchiveConfig;
  uploader?: AccountOpeningSharePointArchiveUploader;
  now?: Date;
}): Promise<AccountOpeningDraftGenerationResult> {
  const now = input.now ?? new Date();
  const draft = buildAccountOpeningCompletedDraft(input.item, now);
  const config = input.config ?? getAccountOpeningSharePointArchiveConfig();
  const skippedReason = getSharePointArchiveSkippedReason(config);

  if (skippedReason) {
    return {
      draft,
      sharePointStatus: 'SKIPPED_DISABLED',
      sharePointNote: `SharePoint draft upload skipped: ${skippedReason}`,
      sharePointSkippedReason: skippedReason,
      sharePointFolderUrl: input.item.sharePointFolderUrl,
      sharePointLastAttemptAt: now,
    };
  }

  const pack = buildAccountOpeningDraftPack(input.item, draft, config, now);

  try {
    const result = await (input.uploader ?? createGraphSharePointArchiveUploader(config)).uploadArchivePack(pack);

    return {
      draft,
      sharePointStatus: 'UPLOADED',
      sharePointNote: `SharePoint completed draft pack uploaded: ${pack.metadata.fileNames.join(', ')}.`,
      sharePointSkippedReason: null,
      sharePointFolderUrl: result.folderUrl,
      sharePointLastAttemptAt: now,
      packMetadata: pack.metadata,
    };
  } catch (error) {
    return {
      draft,
      sharePointStatus: 'UPLOAD_FAILED',
      sharePointNote: error instanceof Error ? error.message : 'SharePoint completed draft upload failed.',
      sharePointSkippedReason: null,
      sharePointFolderUrl: input.item.sharePointFolderUrl,
      sharePointLastAttemptAt: now,
      packMetadata: pack.metadata,
    };
  }
}
