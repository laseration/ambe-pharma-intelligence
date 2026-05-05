'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  updateCommercialIntelItem,
  type CommercialIntelAction,
} from '../../../../lib/commercialIntelApi';

function value(formData: FormData, key: string): string {
  const rawValue = formData.get(key);
  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function sanitizeReturnTo(value: string | null | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed || !trimmed.startsWith('/dashboard')) {
    return '/dashboard/commercial-intel';
  }

  if (trimmed.startsWith('//') || trimmed.includes('://')) {
    return '/dashboard/commercial-intel';
  }

  return trimmed;
}

function isCommercialIntelAction(value: string): value is CommercialIntelAction {
  return value === 'APPROVE' || value === 'REJECT' || value === 'EXPIRE';
}

function buildActionMessage(action: CommercialIntelAction): string {
  if (action === 'APPROVE') {
    return 'Knowledge approved.';
  }

  if (action === 'REJECT') {
    return 'Rejected as not useful.';
  }

  return 'Note expired.';
}

export async function submitCommercialIntelAction(formData: FormData) {
  const itemId = value(formData, 'itemId');
  const action = value(formData, 'action');
  const note = value(formData, 'note') || undefined;
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!itemId || !isCommercialIntelAction(action)) {
    redirect('/dashboard/commercial-intel?error=Missing+commercial+intel+action');
  }

  try {
    await updateCommercialIntelItem(itemId, {
      action,
      note,
      actorType: 'OPERATOR',
      actorIdentifier: 'web-commercial-intel',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update this commercial note.';
    redirect(
      `/dashboard/commercial-intel/${encodeURIComponent(itemId)}?error=${encodeURIComponent(message)}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  revalidatePath('/dashboard/commercial-intel');
  revalidatePath(`/dashboard/commercial-intel/${itemId}`);

  redirect(
    `/dashboard/commercial-intel/${encodeURIComponent(itemId)}?message=${encodeURIComponent(buildActionMessage(action))}&returnTo=${encodeURIComponent(returnTo)}`,
  );
}
