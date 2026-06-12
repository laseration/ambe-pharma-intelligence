export type AccountOpeningFieldClass =
  | 'SAFE_AUTOFILL'
  | 'REVIEW_REQUIRED'
  | 'MUST_STAY_BLANK'
  | 'SIGNATURE'
  | 'BANKING'
  | 'DIRECT_DEBIT'
  | 'CREDIT_RISK'
  | 'LEGAL_RISK'
  | 'REGULATORY_DECLARATION'
  | 'UNKNOWN';

export type AccountOpeningPolicyDecisionKind =
  | 'AUTOFILL_ALLOWED'
  | 'REVIEW_REQUIRED'
  | 'MUST_STAY_BLANK';

export type AccountOpeningPolicyRiskCategory =
  | 'LOW_RISK_COMPANY_PROFILE'
  | 'SIGNING'
  | 'BANKING'
  | 'DIRECT_DEBIT'
  | 'CREDIT_RISK'
  | 'LEGAL_RISK'
  | 'REGULATORY'
  | 'UNKNOWN';

export type AccountOpeningFieldPolicyDecision = {
  safeToAutofill: boolean;
  policyDecision: AccountOpeningPolicyDecisionKind;
  fieldClass: AccountOpeningFieldClass;
  riskCategory: AccountOpeningPolicyRiskCategory;
  reason: string;
  defaultSignatoryRoutingNote: string | null;
  signingNote: string | null;
  leaveBlank: boolean;
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
  'legalCompanyName',
  'tradingName',
  'companyRegistrationNumber',
  'companyNumber',
  'vatNumber',
  'registeredOffice',
  'registeredAddress',
  'tradingAddress',
  'telephone',
  'mainContactPhone',
  'email',
  'mainContactEmail',
  'accountsEmail',
  'accountsContact',
  'mainContactName',
  'website',
  'businessHours',
  'companyType',
  'businessDescription',
]);

const DEFAULT_SIGNATORY_ROUTING_NOTE =
  'Default signatory is Aman Dhillon for ordinary low-risk account-opening information.';
const DIRECTOR_SIGNATORY_ROUTING_NOTE =
  'Route to Sandeep Patel only if a Director signature, guarantee, bank mandate, or formal director authority is required.';
const REGULATORY_SIGNATORY_ROUTING_NOTE =
  'Route RP/GDP/WDA/regulatory declarations to Dilshad Moulana for review.';
const NO_AUTO_SIGN_NOTE =
  'Never auto-sign, insert a signature image, or fill signature/date fields. Prepare a review-ready draft only.';

const FORBIDDEN_PATTERNS: Array<{
  category: AccountOpeningFieldPolicyDecision['category'];
  fieldClass: AccountOpeningFieldClass;
  riskCategory: AccountOpeningPolicyRiskCategory;
  pattern: RegExp;
  reason: string;
  defaultSignatoryRoutingNote?: string;
  signingNote?: string;
}> = [
  {
    category: 'SIGNATURE',
    fieldClass: 'SIGNATURE',
    riskCategory: 'SIGNING',
    pattern:
      /\b(signature|signed|signatory|director[-\s]*(?:only|signature)|typed\s+signature|date\s+(?:of\s+)?signature|signature\s+date|date\s+signed|signed\s+date)\b/i,
    reason:
      'Signature, signing date, and typed-signature fields must stay blank.',
    defaultSignatoryRoutingNote: DIRECTOR_SIGNATORY_ROUTING_NOTE,
    signingNote: NO_AUTO_SIGN_NOTE,
  },
  {
    category: 'BANK_OR_DIRECT_DEBIT',
    fieldClass: 'DIRECT_DEBIT',
    riskCategory: 'DIRECT_DEBIT',
    pattern: /\b(direct\s*debit|dd\s*mandate)\b/i,
    reason: 'Direct Debit mandate fields must stay blank.',
    defaultSignatoryRoutingNote: DIRECTOR_SIGNATORY_ROUTING_NOTE,
    signingNote:
      'Direct Debit mandates require separate human review and must not be completed by draft automation.',
  },
  {
    category: 'BANK_OR_DIRECT_DEBIT',
    fieldClass: 'BANKING',
    riskCategory: 'BANKING',
    pattern:
      /\b(bank|sort\s*code|account\s*(?:number|no\.?)|iban|swift|bic|payment\s+authority|bank\s+(?:authority|mandate))\b/i,
    reason: 'Bank, bank mandate, and payment-authority fields must stay blank.',
    defaultSignatoryRoutingNote: DIRECTOR_SIGNATORY_ROUTING_NOTE,
    signingNote:
      'Bank mandates and bank authority fields require separate human approval and must not be completed by draft automation.',
  },
  {
    category: 'GUARANTEE_OR_INDEMNITY',
    fieldClass: 'LEGAL_RISK',
    riskCategory: 'LEGAL_RISK',
    pattern:
      /\b(guarantee|guarantor|indemnity|indemnif(?:y|ication)|liabilit(?:y|ies)|unusual\s+liability)\b/i,
    reason: 'Guarantee and indemnity fields require human/legal review.',
    defaultSignatoryRoutingNote: DIRECTOR_SIGNATORY_ROUTING_NOTE,
    signingNote:
      'Guarantees, indemnities, and unusual liability clauses must stay blank until human/legal review.',
  },
  {
    category: 'CREDIT_APPROVAL',
    fieldClass: 'CREDIT_RISK',
    riskCategory: 'CREDIT_RISK',
    pattern:
      /\b(credit\s+(?:limit|approval|approved|terms?|account)|approved\s+by|payment\s+terms?)\b/i,
    reason:
      'Credit approval, credit-account, and credit-term fields must not be auto-filled.',
    signingNote:
      'Credit terms and credit-risk fields require commercial review before completion.',
  },
  {
    category: 'REGULATORY_DECLARATION',
    fieldClass: 'REGULATORY_DECLARATION',
    riskCategory: 'REGULATORY',
    pattern:
      /\b(responsible\s+person|rp\b|gdp\b|wda\b|wholesale\s+dealer|mhra|gphc|cqc|declaration)\b/i,
    reason:
      'Regulatory declarations require review and must stay blank by default.',
    defaultSignatoryRoutingNote: REGULATORY_SIGNATORY_ROUTING_NOTE,
    signingNote:
      'RP/GDP/WDA/regulatory declarations should be routed to Dilshad Moulana and left blank by default.',
  },
];

function allowAutofillDecision(): AccountOpeningFieldPolicyDecision {
  return {
    safeToAutofill: true,
    policyDecision: 'AUTOFILL_ALLOWED',
    fieldClass: 'SAFE_AUTOFILL',
    riskCategory: 'LOW_RISK_COMPANY_PROFILE',
    reason: 'Field is on the explicit low-risk company-profile allowlist.',
    defaultSignatoryRoutingNote: DEFAULT_SIGNATORY_ROUTING_NOTE,
    signingNote: null,
    leaveBlank: false,
    category: 'SAFE_COMPANY_PROFILE',
  };
}

export function evaluateAccountOpeningAutofillPolicy(input: {
  fieldKey?: string | null;
  fieldLabel?: string | null;
}): AccountOpeningFieldPolicyDecision {
  const combined = [input.fieldKey, input.fieldLabel].filter(Boolean).join(' ');
  for (const forbidden of FORBIDDEN_PATTERNS) {
    if (forbidden.pattern.test(combined)) {
      return {
        safeToAutofill: false,
        policyDecision: 'MUST_STAY_BLANK',
        fieldClass: forbidden.fieldClass,
        riskCategory: forbidden.riskCategory,
        reason: forbidden.reason,
        defaultSignatoryRoutingNote:
          forbidden.defaultSignatoryRoutingNote ?? null,
        signingNote: forbidden.signingNote ?? null,
        leaveBlank: true,
        category: forbidden.category,
      };
    }
  }

  if (input.fieldKey && SAFE_FIELD_KEYS.has(input.fieldKey)) {
    return allowAutofillDecision();
  }

  return {
    safeToAutofill: false,
    policyDecision: 'REVIEW_REQUIRED',
    fieldClass: 'UNKNOWN',
    riskCategory: 'UNKNOWN',
    reason: 'Unknown account-opening fields stay blank until reviewed.',
    defaultSignatoryRoutingNote: null,
    signingNote:
      'Unknown fields must not be guessed. Leave blank until a reviewer confirms the answer.',
    leaveBlank: true,
    category: 'UNKNOWN',
  };
}

export function accountOpeningForbiddenFieldsEnforced(): boolean {
  return process.env.ACCOUNT_OPENING_FORBIDDEN_FIELDS_ENFORCED !== 'false';
}
