'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  generateAccountOpeningDraft,
  saveAccountOpeningMissingInfo,
  updateAccountOpeningStatus,
  type AccountOpeningStatusAction,
} from '../../../../lib/accountOpeningApi';

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

function buildDetailRedirect(caseId: string, params: Record<string, string>, returnTo: string): string {
  const searchParams = new URLSearchParams(params);
  searchParams.set('returnTo', returnTo);
  return `/dashboard/account-opening/${encodeURIComponent(caseId)}?${searchParams.toString()}`;
}

function isStatusAction(value: string): value is AccountOpeningStatusAction {
  return value === 'MARKED_NEEDS_INFO' || value === 'APPROVED_FOR_COMPLETION' || value === 'REJECTED';
}

function buildStatusMessage(action: AccountOpeningStatusAction): string {
  switch (action) {
    case 'MARKED_NEEDS_INFO':
      return 'Marked needs info.';
    case 'APPROVED_FOR_COMPLETION':
      return 'Approved for completion only — this does not sign or send the form.';
    case 'REJECTED':
      return 'Rejected — no form will be completed, signed, uploaded, or sent.';
    default:
      return 'Saved.';
  }
}

export async function submitAccountOpeningGenerateDraftAction(formData: FormData) {
  const caseId = value(formData, 'caseId');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!caseId) {
    redirect('/dashboard/review?error=Missing+account-opening+case');
  }

  try {
    await generateAccountOpeningDraft(caseId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not generate completed draft.';
    redirect(buildDetailRedirect(caseId, { error: message }, returnTo));
  }

  revalidatePath('/dashboard/review');
  revalidatePath(`/dashboard/account-opening/${caseId}`);

  redirect(buildDetailRedirect(caseId, { message: 'Completed draft generated. Draft only - not signed or sent.' }, returnTo));
}

export async function submitAccountOpeningMissingInfoAction(formData: FormData) {
  const caseId = value(formData, 'caseId');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!caseId) {
    redirect('/dashboard/review?error=Missing+account-opening+case');
  }

  try {
    await saveAccountOpeningMissingInfo(caseId, {
      website: value(formData, 'website') || null,
      numberOfEmployees: value(formData, 'numberOfEmployees') || null,
      businessHours: value(formData, 'businessHours') || null,
      estimatedMonthlyPurchases: value(formData, 'estimatedMonthlyPurchases') || null,
      webOrdering: value(formData, 'webOrdering') || null,
      directDebitRequested: value(formData, 'directDebitRequested') || null,
      cdLicenceApplies: value(formData, 'cdLicenceApplies') || null,
      gphcPremisesNumber: value(formData, 'gphcPremisesNumber') || null,
      cqcRegistration: value(formData, 'cqcRegistration') || null,
      reviewerNotes: value(formData, 'reviewerNotes') || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save missing information.';
    redirect(buildDetailRedirect(caseId, { error: message }, returnTo));
  }

  revalidatePath('/dashboard/review');
  revalidatePath(`/dashboard/account-opening/${caseId}`);

  redirect(buildDetailRedirect(caseId, { message: 'Missing information saved.' }, returnTo));
}

export async function submitAccountOpeningStatusAction(formData: FormData) {
  const caseId = value(formData, 'caseId');
  const action = value(formData, 'action');
  const note = value(formData, 'note') || null;
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!caseId || !isStatusAction(action)) {
    redirect('/dashboard/review?error=Missing+account-opening+status+action');
  }

  try {
    await updateAccountOpeningStatus(caseId, {
      action,
      note,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update account-opening status.';
    redirect(buildDetailRedirect(caseId, { error: message }, returnTo));
  }

  revalidatePath('/dashboard/review');
  revalidatePath(`/dashboard/account-opening/${caseId}`);

  redirect(buildDetailRedirect(caseId, { message: buildStatusMessage(action) }, returnTo));
}
