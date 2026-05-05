'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  updateCustomerRequest,
  type CustomerDemandAction,
} from '../../../../lib/customerRequestsApi';

function value(formData: FormData, key: string): string {
  const rawValue = formData.get(key);
  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function sanitizeReturnTo(value: string | null | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed || !trimmed.startsWith('/dashboard')) {
    return '/dashboard/customer-requests';
  }

  if (trimmed.startsWith('//') || trimmed.includes('://')) {
    return '/dashboard/customer-requests';
  }

  return trimmed;
}

function isCustomerDemandAction(value: string): value is CustomerDemandAction {
  return value === 'APPROVE' || value === 'REJECT' || value === 'EXPIRE';
}

function buildActionMessage(action: CustomerDemandAction): string {
  if (action === 'APPROVE') {
    return 'Request approved.';
  }

  if (action === 'REJECT') {
    return 'Rejected as not useful.';
  }

  return 'Request expired.';
}

export async function submitCustomerRequestAction(formData: FormData) {
  const itemId = value(formData, 'itemId');
  const action = value(formData, 'action');
  const note = value(formData, 'note') || undefined;
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!itemId || !isCustomerDemandAction(action)) {
    redirect('/dashboard/customer-requests?error=Missing+customer+request+action');
  }

  try {
    await updateCustomerRequest(itemId, {
      action,
      note,
      actorType: 'OPERATOR',
      actorIdentifier: 'web-customer-requests',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update this customer request.';
    redirect(
      `/dashboard/customer-requests/${encodeURIComponent(itemId)}?error=${encodeURIComponent(message)}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  revalidatePath('/dashboard/customer-requests');
  revalidatePath(`/dashboard/customer-requests/${itemId}`);

  redirect(
    `/dashboard/customer-requests/${encodeURIComponent(itemId)}?message=${encodeURIComponent(buildActionMessage(action))}&returnTo=${encodeURIComponent(returnTo)}`,
  );
}
