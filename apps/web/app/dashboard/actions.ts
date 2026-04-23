'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  regenerateOpportunities,
  updateOpportunityStatus,
  type OpportunityTriageStatus,
} from '../../lib/opportunitiesApi';

function value(formData: FormData, key: string): string {
  const rawValue = formData.get(key);
  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function normalizeRedirectTarget(value: string): string {
  if (value.startsWith('/dashboard')) {
    return value;
  }

  return '/dashboard';
}

function appendDashboardQuery(target: string, key: string, value: string): string {
  const [pathnameWithQuery = '/dashboard', hash = ''] = target.split('#');
  const [pathname, query = ''] = pathnameWithQuery.split('?');
  const searchParams = new URLSearchParams(query);
  searchParams.set(key, value);
  const nextQuery = searchParams.toString();

  return `${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash ? `#${hash}` : ''}`;
}

function normalizeDashboardStatus(value: string): OpportunityTriageStatus | null {
  switch (value) {
    case 'REVIEWED':
    case 'ACTIONED':
    case 'DISMISSED':
      return value;
    default:
      return null;
  }
}

export async function submitOpportunityTriageAction(formData: FormData) {
  const opportunityId = value(formData, 'opportunityId');
  const status = normalizeDashboardStatus(value(formData, 'status'));
  const redirectTarget = normalizeRedirectTarget(value(formData, 'redirectTo') || '/dashboard');

  if (!opportunityId || !status) {
    redirect(appendDashboardQuery(redirectTarget, 'error', 'Missing opportunity triage input'));
  }

  try {
    await updateOpportunityStatus(opportunityId, {
      status,
      actorType: 'OPERATOR',
      actorIdentifier: 'web-dashboard',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Opportunity triage failed.';
    redirect(appendDashboardQuery(redirectTarget, 'error', message));
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/opportunities');
  redirect(appendDashboardQuery(redirectTarget, 'updated', status.toLowerCase()));
}

export async function submitOpportunityRefreshAction() {
  try {
    const result = await regenerateOpportunities();
    revalidatePath('/dashboard');
    redirect(`/dashboard?refreshed=${encodeURIComponent(String(result.generatedCount))}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Opportunity refresh failed.';
    redirect(`/dashboard?error=${encodeURIComponent(message)}`);
  }
}
