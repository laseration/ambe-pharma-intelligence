'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  approveAccountOpeningCompletedFormFiling,
  fileAccountOpeningCompletedFormToSharePoint,
  generateAccountOpeningBinaryFillPreview,
  generateAccountOpeningFillPreview,
  generateAccountOpeningDraft,
  reprocessAccountOpeningStoredSource,
  saveAccountOpeningFieldMappings,
  saveAccountOpeningMissingInfo,
  updateAccountOpeningStatus,
  type AccountOpeningFieldMapping,
  type AccountOpeningFieldMappingSaveInput,
  type AccountOpeningFieldMappingStatus,
  type AccountOpeningMissingInfoResponses,
  type AccountOpeningStatusAction,
} from '../../../../lib/accountOpeningApi';
import { requireCurrentWebCapability } from '../../../../lib/serverWebAuth';

const STATUS_ACTIONS = new Set<AccountOpeningStatusAction>([
  'MARKED_NEEDS_INFO',
  'APPROVED_FOR_COMPLETION',
  'REJECTED',
]);
const FIELD_MAPPING_STATUSES = new Set<AccountOpeningFieldMappingStatus>([
  'UNMAPPED',
  'MAPPED_SAFE',
  'MAPPED_REVIEW_REQUIRED',
  'BLOCKED',
  'IGNORED',
  'NEEDS_OPERATOR_INPUT',
]);
const FIELD_MAPPING_SOURCE_TYPES = new Set<
  AccountOpeningFieldMapping['sourceType']
>(['DRAFT_FIELD', 'SOURCE_EVIDENCE', 'SYSTEM_RULE', 'OPERATOR_CREATED']);

function value(formData: FormData, key: string): string {
  const rawValue = formData.get(key);
  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function sanitizeReturnTo(value: string | null | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed || !trimmed.startsWith('/dashboard')) {
    return '/dashboard/review';
  }

  if (trimmed.startsWith('//') || trimmed.includes('://')) {
    return '/dashboard/review';
  }

  return trimmed;
}

function buildRedirectTarget(
  caseId: string,
  params: Record<string, string>,
  returnTo: string,
): string {
  const searchParams = new URLSearchParams(params);
  searchParams.set('returnTo', returnTo);
  return `/dashboard/account-opening/${encodeURIComponent(caseId)}?${searchParams.toString()}`;
}

function optionalValue(
  formData: FormData,
  key: keyof AccountOpeningMissingInfoResponses,
): string | undefined {
  const trimmed = value(formData, key);
  return trimmed || undefined;
}

function buildMissingInfoResponses(
  formData: FormData,
): AccountOpeningMissingInfoResponses {
  return {
    website: optionalValue(formData, 'website'),
    numberOfEmployees: optionalValue(formData, 'numberOfEmployees'),
    businessHours: optionalValue(formData, 'businessHours'),
    estimatedMonthlyPurchases: optionalValue(
      formData,
      'estimatedMonthlyPurchases',
    ),
    webOrdering: optionalValue(formData, 'webOrdering'),
    directDebitRequested: optionalValue(formData, 'directDebitRequested'),
    cdLicenceApplies: optionalValue(formData, 'cdLicenceApplies'),
    gphcPremisesNumber: optionalValue(formData, 'gphcPremisesNumber'),
    cqcRegistration: optionalValue(formData, 'cqcRegistration'),
    reviewerNotes: optionalValue(formData, 'reviewerNotes'),
  };
}

function nullableValue(formData: FormData, key: string): string | null {
  return value(formData, key) || null;
}

function buildFieldMappings(
  formData: FormData,
): AccountOpeningFieldMappingSaveInput[] {
  const count = Number.parseInt(value(formData, 'mappingCount'), 10);
  const mappingCount = Number.isFinite(count) && count > 0 ? count : 0;
  const mappings: AccountOpeningFieldMappingSaveInput[] = [];

  for (let index = 0; index < mappingCount; index += 1) {
    const prefix = `mapping-${index}`;
    const supplierFieldLabel = value(formData, `${prefix}-supplierFieldLabel`);
    const sourceType = value(
      formData,
      `${prefix}-sourceType`,
    ) as AccountOpeningFieldMapping['sourceType'];
    const status = value(
      formData,
      `${prefix}-status`,
    ) as AccountOpeningFieldMappingStatus;

    if (
      !supplierFieldLabel ||
      !FIELD_MAPPING_SOURCE_TYPES.has(sourceType) ||
      !FIELD_MAPPING_STATUSES.has(status)
    ) {
      continue;
    }

    mappings.push({
      id: nullableValue(formData, `${prefix}-id`),
      supplierFieldLabel,
      supplierSectionLabel: nullableValue(
        formData,
        `${prefix}-supplierSectionLabel`,
      ),
      sourceType,
      sourceEvidenceId: nullableValue(formData, `${prefix}-sourceEvidenceId`),
      evidenceSnippet: nullableValue(formData, `${prefix}-evidenceSnippet`),
      suggestedDraftFieldKey: nullableValue(
        formData,
        `${prefix}-suggestedDraftFieldKey`,
      ),
      mappedDraftFieldKey: nullableValue(
        formData,
        `${prefix}-mappedDraftFieldKey`,
      ),
      status,
      operatorNote: nullableValue(formData, `${prefix}-operatorNote`),
    });
  }

  return mappings;
}

function successMessage(action: AccountOpeningStatusAction): string {
  switch (action) {
    case 'MARKED_NEEDS_INFO':
      return 'Marked as needs info.';
    case 'APPROVED_FOR_COMPLETION':
      return 'Approved for completion only — this does not sign or send the form.';
    case 'REJECTED':
      return 'Rejected — no form will be completed, signed, uploaded, or sent.';
  }
}

export async function submitAccountOpeningMissingInfoAction(
  formData: FormData,
) {
  await requireCurrentWebCapability('account-opening:manage');

  const caseId = value(formData, 'caseId');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!caseId) {
    redirect('/dashboard/review?error=Missing+account-opening+case');
  }

  try {
    await saveAccountOpeningMissingInfo(
      caseId,
      buildMissingInfoResponses(formData),
    );
  } catch (error) {
    redirect(
      buildRedirectTarget(
        caseId,
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to save missing information.',
        },
        returnTo,
      ),
    );
  }

  revalidatePath('/dashboard/review');
  revalidatePath(`/dashboard/account-opening/${caseId}`);
  redirect(
    buildRedirectTarget(
      caseId,
      {
        message: 'Missing information saved.',
      },
      returnTo,
    ),
  );
}

export async function submitAccountOpeningStatusAction(formData: FormData) {
  await requireCurrentWebCapability('account-opening:manage');

  const caseId = value(formData, 'caseId');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));
  const action = value(formData, 'action') as AccountOpeningStatusAction;

  if (!caseId || !STATUS_ACTIONS.has(action)) {
    redirect('/dashboard/review?error=Missing+account-opening+status+action');
  }

  try {
    await updateAccountOpeningStatus(caseId, {
      action,
      note: value(formData, 'note') || null,
    });
  } catch (error) {
    redirect(
      buildRedirectTarget(
        caseId,
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to update account-opening status.',
        },
        returnTo,
      ),
    );
  }

  revalidatePath('/dashboard/review');
  revalidatePath(`/dashboard/account-opening/${caseId}`);
  redirect(
    buildRedirectTarget(
      caseId,
      {
        message: successMessage(action),
      },
      returnTo,
    ),
  );
}

export async function submitGenerateAccountOpeningDraftAction(
  formData: FormData,
) {
  await requireCurrentWebCapability('account-opening:manage');

  const caseId = value(formData, 'caseId');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!caseId) {
    redirect('/dashboard/review?error=Missing+account-opening+case');
  }

  try {
    await generateAccountOpeningDraft(caseId);
  } catch (error) {
    redirect(
      buildRedirectTarget(
        caseId,
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to generate completion draft.',
        },
        returnTo,
      ),
    );
  }

  revalidatePath('/dashboard/review');
  revalidatePath(`/dashboard/account-opening/${caseId}`);
  redirect(
    buildRedirectTarget(
      caseId,
      {
        message: 'Completion draft generated for review.',
      },
      returnTo,
    ),
  );
}

export async function submitReprocessAccountOpeningStoredSourceAction(
  formData: FormData,
) {
  await requireCurrentWebCapability('account-opening:manage');

  const caseId = value(formData, 'caseId');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!caseId) {
    redirect('/dashboard/review?error=Missing+account-opening+case');
  }

  try {
    await reprocessAccountOpeningStoredSource(caseId);
  } catch (error) {
    redirect(
      buildRedirectTarget(
        caseId,
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to reprocess account-opening stored source.',
        },
        returnTo,
      ),
    );
  }

  revalidatePath('/dashboard/review');
  revalidatePath(`/dashboard/account-opening/${caseId}`);
  redirect(
    buildRedirectTarget(
      caseId,
      {
        message: 'Stored source reprocessed for review.',
      },
      returnTo,
    ),
  );
}

export async function submitGenerateAccountOpeningFillPreviewAction(
  formData: FormData,
) {
  await requireCurrentWebCapability('account-opening:manage');

  const caseId = value(formData, 'caseId');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!caseId) {
    redirect('/dashboard/review?error=Missing+account-opening+case');
  }

  try {
    await generateAccountOpeningFillPreview(caseId);
  } catch (error) {
    redirect(
      buildRedirectTarget(
        caseId,
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to generate fill-value preview.',
        },
        returnTo,
      ),
    );
  }

  revalidatePath('/dashboard/review');
  revalidatePath(`/dashboard/account-opening/${caseId}`);
  redirect(
    buildRedirectTarget(
      caseId,
      {
        message: 'Internal fill-value preview generated for review.',
      },
      returnTo,
    ),
  );
}

export async function submitGenerateAccountOpeningBinaryFillPreviewAction(
  formData: FormData,
) {
  await requireCurrentWebCapability('account-opening:manage');

  const caseId = value(formData, 'caseId');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!caseId) {
    redirect('/dashboard/review?error=Missing+account-opening+case');
  }

  try {
    await generateAccountOpeningBinaryFillPreview(caseId);
  } catch (error) {
    redirect(
      buildRedirectTarget(
        caseId,
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to generate binary fill preview.',
        },
        returnTo,
      ),
    );
  }

  revalidatePath('/dashboard/review');
  revalidatePath(`/dashboard/account-opening/${caseId}`);
  redirect(
    buildRedirectTarget(
      caseId,
      {
        message: 'Binary fill preview generated for review.',
      },
      returnTo,
    ),
  );
}

export async function submitApproveAccountOpeningCompletedFormFilingAction(
  formData: FormData,
) {
  await requireCurrentWebCapability('account-opening:manage');

  const caseId = value(formData, 'caseId');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));
  const binaryFillPreviewId = value(formData, 'binaryFillPreviewId') || null;

  if (!caseId) {
    redirect('/dashboard/review?error=Missing+account-opening+case');
  }

  try {
    await approveAccountOpeningCompletedFormFiling(caseId, {
      binaryFillPreviewId,
      approvalNote: value(formData, 'approvalNote') || null,
    });
  } catch (error) {
    redirect(
      buildRedirectTarget(
        caseId,
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to approve completed unsigned form for filing.',
        },
        returnTo,
      ),
    );
  }

  revalidatePath('/dashboard/review');
  revalidatePath(`/dashboard/account-opening/${caseId}`);
  redirect(
    buildRedirectTarget(
      caseId,
      {
        message:
          'Completed unsigned form approved for internal SharePoint filing only.',
      },
      returnTo,
    ),
  );
}

export async function submitFileAccountOpeningCompletedFormToSharePointAction(
  formData: FormData,
) {
  await requireCurrentWebCapability('account-opening:manage');

  const caseId = value(formData, 'caseId');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));
  const binaryFillPreviewId = value(formData, 'binaryFillPreviewId') || null;

  if (!caseId) {
    redirect('/dashboard/review?error=Missing+account-opening+case');
  }

  try {
    await fileAccountOpeningCompletedFormToSharePoint(caseId, {
      binaryFillPreviewId,
      filingNote: value(formData, 'filingNote') || null,
    });
  } catch (error) {
    redirect(
      buildRedirectTarget(
        caseId,
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to file completed unsigned form to SharePoint.',
        },
        returnTo,
      ),
    );
  }

  revalidatePath('/dashboard/review');
  revalidatePath(`/dashboard/account-opening/${caseId}`);
  redirect(
    buildRedirectTarget(
      caseId,
      {
        message:
          'Completed unsigned form filing status updated for internal SharePoint filing only.',
      },
      returnTo,
    ),
  );
}

export async function submitAccountOpeningFieldMappingsAction(
  formData: FormData,
) {
  await requireCurrentWebCapability('account-opening:manage');

  const caseId = value(formData, 'caseId');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!caseId) {
    redirect('/dashboard/review?error=Missing+account-opening+case');
  }

  try {
    await saveAccountOpeningFieldMappings(caseId, buildFieldMappings(formData));
  } catch (error) {
    redirect(
      buildRedirectTarget(
        caseId,
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to save field mappings.',
        },
        returnTo,
      ),
    );
  }

  revalidatePath('/dashboard/review');
  revalidatePath(`/dashboard/account-opening/${caseId}`);
  redirect(
    buildRedirectTarget(
      caseId,
      {
        message: 'Field mappings saved for review.',
      },
      returnTo,
    ),
  );
}
