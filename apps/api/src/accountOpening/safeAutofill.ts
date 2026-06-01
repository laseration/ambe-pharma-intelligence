import { evaluateAccountOpeningAutofillPolicy } from './policy';

export type SafeAutofillCandidate = {
  fieldKey?: string | null;
  fieldLabel?: string | null;
  value?: string | null;
};

export type SafeAutofillResult = {
  values: Record<string, string>;
  blocked: Array<{
    fieldKey: string | null;
    fieldLabel: string | null;
    reason: string;
  }>;
  safetySummary: {
    whitelistOnly: true;
    signaturesBlocked: true;
    bankAndDirectDebitBlocked: true;
    guaranteesAndIndemnitiesBlocked: true;
    creditApprovalBlocked: true;
    regulatoryDeclarationsBlocked: true;
    unknownFieldsBlank: true;
    internalOnly: true;
    externalSendAllowed: false;
  };
};

export function buildSafeAccountOpeningAutofill(
  candidates: SafeAutofillCandidate[],
): SafeAutofillResult {
  const values: Record<string, string> = {};
  const blocked: SafeAutofillResult['blocked'] = [];

  for (const candidate of candidates) {
    const decision = evaluateAccountOpeningAutofillPolicy({
      fieldKey: candidate.fieldKey,
      fieldLabel: candidate.fieldLabel,
    });
    const value = candidate.value?.trim();

    if (!decision.safeToAutofill || !candidate.fieldKey || !value) {
      blocked.push({
        fieldKey: candidate.fieldKey ?? null,
        fieldLabel: candidate.fieldLabel ?? null,
        reason: decision.reason,
      });
      continue;
    }

    values[candidate.fieldKey] = value;
  }

  return {
    values,
    blocked,
    safetySummary: {
      whitelistOnly: true,
      signaturesBlocked: true,
      bankAndDirectDebitBlocked: true,
      guaranteesAndIndemnitiesBlocked: true,
      creditApprovalBlocked: true,
      regulatoryDeclarationsBlocked: true,
      unknownFieldsBlank: true,
      internalOnly: true,
      externalSendAllowed: false,
    },
  };
}
