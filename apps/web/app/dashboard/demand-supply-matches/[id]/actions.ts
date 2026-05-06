'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  updateDemandSupplyMatch,
  type DemandSupplyMatchAction,
} from '../../../../lib/demandSupplyMatchesApi';

function value(formData: FormData, key: string): string {
  const rawValue = formData.get(key);
  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function sanitizeReturnTo(value: string | null | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed || !trimmed.startsWith('/dashboard')) {
    return '/dashboard/demand-supply-matches';
  }

  if (trimmed.startsWith('//') || trimmed.includes('://')) {
    return '/dashboard/demand-supply-matches';
  }

  return trimmed;
}

function isDemandSupplyMatchAction(value: string): value is DemandSupplyMatchAction {
  return value === 'REVIEW' || value === 'REJECT' || value === 'EXPIRE';
}

function buildActionMessage(action: DemandSupplyMatchAction): string {
  if (action === 'REVIEW') {
    return 'Match marked reviewed.';
  }

  if (action === 'REJECT') {
    return 'Match rejected.';
  }

  return 'Match expired.';
}

export async function submitDemandSupplyMatchAction(formData: FormData) {
  const itemId = value(formData, 'itemId');
  const action = value(formData, 'action');
  const note = value(formData, 'note') || undefined;
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!itemId || !isDemandSupplyMatchAction(action)) {
    redirect('/dashboard/demand-supply-matches?error=Missing+demand+match+action');
  }

  try {
    await updateDemandSupplyMatch(itemId, {
      action,
      note,
      actorType: 'OPERATOR',
      actorIdentifier: 'web-demand-matches',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update this demand match.';
    redirect(
      `/dashboard/demand-supply-matches/${encodeURIComponent(itemId)}?error=${encodeURIComponent(message)}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  revalidatePath('/dashboard/demand-supply-matches');
  revalidatePath(`/dashboard/demand-supply-matches/${itemId}`);

  redirect(
    `/dashboard/demand-supply-matches/${encodeURIComponent(itemId)}?message=${encodeURIComponent(buildActionMessage(action))}&returnTo=${encodeURIComponent(returnTo)}`,
  );
}
