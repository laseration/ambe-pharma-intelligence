'use server';

import { redirect } from 'next/navigation';

import {
  createManualAccountOpeningCase,
  type AccountOpeningCaseType,
} from '../../../../lib/accountOpeningApi';
import { requireCurrentWebCapability } from '../../../../lib/serverWebAuth';

const CASE_TYPES = new Set<AccountOpeningCaseType>([
  'SUPPLIER_ONBOARDING',
  'CUSTOMER_ONBOARDING',
  'UNKNOWN',
]);

export type CreateCaseFormState = { error: string | null };

function field(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === 'string' ? raw.trim() : '';
}

export async function createAccountOpeningCaseAction(
  _prevState: CreateCaseFormState,
  formData: FormData,
): Promise<CreateCaseFormState> {
  await requireCurrentWebCapability('account-opening:manage');

  const counterpartyName = field(formData, 'counterpartyName');
  if (!counterpartyName) {
    return { error: 'Counterparty name is required.' };
  }

  const caseTypeRaw = field(formData, 'caseType');
  const caseType: AccountOpeningCaseType = CASE_TYPES.has(
    caseTypeRaw as AccountOpeningCaseType,
  )
    ? (caseTypeRaw as AccountOpeningCaseType)
    : 'UNKNOWN';

  let createdId: string;
  try {
    const created = await createManualAccountOpeningCase({
      counterpartyName,
      counterpartyEmail: field(formData, 'counterpartyEmail') || null,
      caseType,
      internalNote: field(formData, 'internalNote') || null,
    });
    createdId = created.id;
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to create the account-opening case.',
    };
  }

  // redirect() throws NEXT_REDIRECT, so it must run outside the try/catch above.
  redirect(`/dashboard/account-opening/${encodeURIComponent(createdId)}`);
}
