export type AccountOpeningFieldPolicyDecision = {
  safeToAutofill: boolean;
  reason: string;
  category:
    | 'SAFE_COMPANY_PROFILE'
    | 'SIGNATURE'
    | 'BANK_OR_DIRECT_DEBIT'
    | 'GUARANTEE_OR_INDEMNITY'
    | 'CREDIT_APPROVAL'
    | 'REGULATORY_DECLARATION'
    | 'UNKNOWN';
};

const SAFE_FIELD_KEYS = new Set([
  'companyName',
  'tradingName',
  'companyRegistrationNumber',
  'vatNumber',
  'registeredOffice',
  'tradingAddress',
  'telephone',
  'email',
  'accountsEmail',
  'website',
]);

const FORBIDDEN_PATTERNS: Array<{
  category: AccountOpeningFieldPolicyDecision['category'];
  pattern: RegExp;
  reason: string;
}> = [
  {
    category: 'SIGNATURE',
    pattern:
      /\b(signature|signed|signatory|director[-\s]*(?:only|signature)|typed\s+signature)\b/i,
    reason: 'Signature and typed-signature fields must stay blank.',
  },
  {
    category: 'BANK_OR_DIRECT_DEBIT',
    pattern:
      /\b(bank|sort\s*code|account\s*(?:number|no\.?)|iban|swift|bic|direct\s*debit|dd\s*mandate|payment\s+authority|bank\s+authority)\b/i,
    reason: 'Bank, Direct Debit, and payment-authority fields must stay blank.',
  },
  {
    category: 'GUARANTEE_OR_INDEMNITY',
    pattern: /\b(guarantee|guarantor|indemnity|indemnif(?:y|ication))\b/i,
    reason: 'Guarantee and indemnity fields require human/legal review.',
  },
  {
    category: 'CREDIT_APPROVAL',
    pattern: /\b(credit\s+(?:limit|approval|approved|terms?)|approved\s+by)\b/i,
    reason: 'Credit approval and credit-limit fields must not be auto-filled.',
  },
  {
    category: 'REGULATORY_DECLARATION',
    pattern:
      /\b(responsible\s+person|rp\b|gdp\b|wda\b|wholesale\s+dealer|mhra|gphc|cqc|declaration)\b/i,
    reason:
      'Regulatory declarations require review and must stay blank by default.',
  },
];

export function evaluateAccountOpeningAutofillPolicy(input: {
  fieldKey?: string | null;
  fieldLabel?: string | null;
}): AccountOpeningFieldPolicyDecision {
  const combined = [input.fieldKey, input.fieldLabel].filter(Boolean).join(' ');
  for (const forbidden of FORBIDDEN_PATTERNS) {
    if (forbidden.pattern.test(combined)) {
      return {
        safeToAutofill: false,
        reason: forbidden.reason,
        category: forbidden.category,
      };
    }
  }

  if (input.fieldKey && SAFE_FIELD_KEYS.has(input.fieldKey)) {
    return {
      safeToAutofill: true,
      reason: 'Field is on the explicit low-risk company-profile allowlist.',
      category: 'SAFE_COMPANY_PROFILE',
    };
  }

  return {
    safeToAutofill: false,
    reason: 'Unknown account-opening fields stay blank until reviewed.',
    category: 'UNKNOWN',
  };
}

export function accountOpeningForbiddenFieldsEnforced(): boolean {
  return process.env.ACCOUNT_OPENING_FORBIDDEN_FIELDS_ENFORCED !== 'false';
}
