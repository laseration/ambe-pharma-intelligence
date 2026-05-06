'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { generateDemandSupplyMatches } from '../../../lib/demandSupplyMatchesApi';

function value(formData: FormData, key: string): string {
  const rawValue = formData.get(key);
  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function sanitizeReturnTo(value: string | null | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed || !trimmed.startsWith('/dashboard/demand-supply-matches')) {
    return '/dashboard/demand-supply-matches';
  }

  if (trimmed.startsWith('//') || trimmed.includes('://')) {
    return '/dashboard/demand-supply-matches';
  }

  return trimmed;
}

function withMessage(returnTo: string, key: 'message' | 'error', message: string) {
  const [path, queryString] = returnTo.split('?');
  const params = new URLSearchParams(queryString ?? '');
  params.delete(key === 'message' ? 'error' : 'message');
  params.set(key, message);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';

  return `${path}${suffix}`;
}

export async function submitGenerateDemandSupplyMatches(formData: FormData) {
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));
  let createdOrUpdatedCount = 0;

  try {
    const result = await generateDemandSupplyMatches();
    createdOrUpdatedCount = result.createdOrUpdatedCount;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not generate demand matches.';
    redirect(withMessage(returnTo, 'error', message));
  }

  revalidatePath('/dashboard/demand-supply-matches');
  redirect(
    withMessage(
      returnTo,
      'message',
      `${createdOrUpdatedCount} demand match ${createdOrUpdatedCount === 1 ? 'candidate' : 'candidates'} generated or refreshed.`,
    ),
  );
}
