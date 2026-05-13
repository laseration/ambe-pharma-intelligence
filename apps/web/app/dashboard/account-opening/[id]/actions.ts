'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  saveAccountOpeningMissingInfo,
  updateAccountOpeningStatus,
  type AccountOpeningMissingInfoResponses,
  type AccountOpeningStatusAction,
} from '../../../../lib/accountOpeningApi';

const STATUS_ACTIONS = new Set<AccountOpeningStatusAction>([
  'MARKED_NEEDS_INFO',
  'APPROVED_FOR_COMPLETION',
  'REJECTED',
]);

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

function buildRedirectTarget(caseId: string, params: Record<string, string>, returnTo: string): string {
  const searchParams = new URLSearchParams(params);
  searchParams.set('returnTo', returnTo);
  return `/dashboard/account-opening/${encodeURIComponent(caseId)}?${searchParams.toString()}`;
}

function optionalValue(formData: FormData, key: keyof AccountOpeningMissingInfoResponses): string | undefined {
  const trimmed = value(formData, key);
  return trimmed || undefined;
}

function buildMissingInfoResponses(formData: FormData): AccountOpeningMissingInfoResponses {
  return {
    website: optionalValue(formData, 'website'),
    numberOfEmployees: optionalValue(formData, 'numberOfEmployees'),
    businessHours: optionalValue(formData, 'businessHours'),
    estimatedMonthlyPurchases: optionalValue(formData, 'estimatedMonthlyPurchases'),
    webOrdering: optionalValue(formData, 'webOrdering'),
    directDebitRequested: optionalValue(formData, 'directDebitRequested'),
    cdLicenceApplies: optionalValue(formData, 'cdLicenceApplies'),
    gphcPremisesNumber: optionalValue(formData, 'gphcPremisesNumber'),
    cqcRegistration: optionalValue(formData, 'cqcRegistration'),
    reviewerNotes: optionalValue(formData, 'reviewerNotes'),
  };
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

export async function submitAccountOpeningMissingInfoAction(formData: FormData) {
  const caseId = value(formData, 'caseId');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!caseId) {
    redirect('/dashboard/review?error=Missing+account-opening+case');
  }

  try {
    await saveAccountOpeningMissingInfo(caseId, buildMissingInfoResponses(formData));
  } catch (error) {
    redirect(
      buildRedirectTarget(caseId, {
        error: error instanceof Error ? error.message : 'Failed to save missing information.',
      }, returnTo),
    );
  }

  revalidatePath('/dashboard/review');
  revalidatePath(`/dashboard/account-opening/${caseId}`);
  redirect(
    buildRedirectTarget(caseId, {
      message: 'Missing information saved.',
    }, returnTo),
  );
}

export async function submitAccountOpeningStatusAction(formData: FormData) {
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
      buildRedirectTarget(caseId, {
        error: error instanceof Error ? error.message : 'Failed to update account-opening status.',
      }, returnTo),
    );
  }

  revalidatePath('/dashboard/review');
  revalidatePath(`/dashboard/account-opening/${caseId}`);
  redirect(
    buildRedirectTarget(caseId, {
      message: successMessage(action),
    }, returnTo),
  );
}
