export type AccountOpeningDocumentClass =
  | 'ACCOUNT_OPENING_FORM'
  | 'GDP_QUESTIONNAIRE'
  | 'TERMS_AND_CONDITIONS'
  | 'CREDIT_APPLICATION'
  | 'DIRECT_DEBIT_MANDATE'
  | 'BANK_MANDATE'
  | 'DIRECTOR_GUARANTEE'
  | 'TRADE_REFERENCES'
  | 'REGULATORY_DECLARATION'
  | 'UNKNOWN_OTHER';

export type AccountOpeningDocumentClassification = {
  sourceEvidenceId: string | null;
  fileName: string | null;
  classification: AccountOpeningDocumentClass;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  matchedEvidence: string[];
  missingEvidence: string[];
  warnings: string[];
  safeForAutomaticCompletion: false;
};

type ClassificationInput = {
  sourceEvidenceId?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  text?: string | null;
};

type Rule = {
  classification: Exclude<AccountOpeningDocumentClass, 'UNKNOWN_OTHER'>;
  label: string;
  pattern: RegExp;
  weight: number;
};

const RULES: Rule[] = [
  {
    classification: 'DIRECT_DEBIT_MANDATE',
    label: 'Direct Debit mandate wording',
    pattern: /\b(direct\s+debit|dd\s+mandate)\b/i,
    weight: 45,
  },
  {
    classification: 'BANK_MANDATE',
    label: 'bank mandate or payment authority wording',
    pattern:
      /\b(bank\s+(?:mandate|authority|account|details)|payment\s+authority|sort\s*code|account\s*(?:no\.?|number))\b/i,
    weight: 42,
  },
  {
    classification: 'DIRECTOR_GUARANTEE',
    label: 'director or personal guarantee wording',
    pattern:
      /\b(director(?:s?'?)?\s+guarantee|personal\s+guarantee|guarantor|indemnity|indemnif(?:y|ication))\b/i,
    weight: 42,
  },
  {
    classification: 'TRADE_REFERENCES',
    label: 'trade reference wording',
    pattern: /\b(trade\s+references?|referee|supplier\s+references?)\b/i,
    weight: 34,
  },
  {
    classification: 'GDP_QUESTIONNAIRE',
    label: 'GDP questionnaire wording',
    pattern:
      /\b(gdp\s+questionnaire|responsible\s+person\s+questionnaire|rp\s+questionnaire|wholesale\s+dealer\s+questionnaire)\b/i,
    weight: 38,
  },
  {
    classification: 'REGULATORY_DECLARATION',
    label: 'regulatory declaration wording',
    pattern:
      /\b(regulatory\s+declaration|responsible\s+person|rp\b|gdp\b|wda\b|wholesale\s+dealer|mhra|gphc|cqc)\b/i,
    weight: 30,
  },
  {
    classification: 'TERMS_AND_CONDITIONS',
    label: 'terms and conditions wording',
    pattern:
      /\b(terms\s+(?:and|&)\s+conditions|standard\s+terms|sale\s+terms)\b/i,
    weight: 34,
  },
  {
    classification: 'CREDIT_APPLICATION',
    label: 'credit application wording',
    pattern:
      /\b(credit\s+application|credit\s+account|credit\s+limit|credit\s+terms)\b/i,
    weight: 30,
  },
  {
    classification: 'ACCOUNT_OPENING_FORM',
    label: 'explicit account-opening form wording',
    pattern:
      /\b(account\s+opening\s+form|new\s+account\s+(?:form|application)|customer\s+account\s+application|trade\s+account\s+application|supplier\s+account\s+application|wholesale\s+account\s+application)\b/i,
    weight: 36,
  },
  {
    classification: 'ACCOUNT_OPENING_FORM',
    label: 'company-profile form fields',
    pattern:
      /\b(company\s+(?:number|registration)|vat\s+(?:number|registration)|registered\s+(?:office|address)|trading\s+name)\b/i,
    weight: 18,
  },
];

function confidenceForScore(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 36) {
    return 'HIGH';
  }

  if (score >= 18) {
    return 'MEDIUM';
  }

  return 'LOW';
}

function mostSpecificClass(
  scores: Map<AccountOpeningDocumentClass, number>,
): AccountOpeningDocumentClass {
  let best: { classification: AccountOpeningDocumentClass; score: number } = {
    classification: 'UNKNOWN_OTHER',
    score: 0,
  };

  for (const [classification, score] of scores) {
    if (score > best.score) {
      best = { classification, score };
    }
  }

  return best.score > 0 ? best.classification : 'UNKNOWN_OTHER';
}

export function classifyAccountOpeningDocument(
  input: ClassificationInput,
): AccountOpeningDocumentClassification {
  const haystack = [input.fileName, input.mimeType, input.text]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n');
  const scores = new Map<AccountOpeningDocumentClass, number>();
  const matchedEvidence: string[] = [];

  for (const rule of RULES) {
    if (!rule.pattern.test(haystack)) {
      continue;
    }

    scores.set(
      rule.classification,
      (scores.get(rule.classification) ?? 0) + rule.weight,
    );
    matchedEvidence.push(rule.label);
  }

  const classification = mostSpecificClass(scores);
  const score = scores.get(classification) ?? 0;
  const confidence = confidenceForScore(score);
  const missingEvidence: string[] = [];
  const warnings: string[] = [];

  if (!input.fileName?.trim()) {
    missingEvidence.push('filename');
  }

  if (!input.text?.trim()) {
    missingEvidence.push('extracted text');
  }

  if (classification === 'UNKNOWN_OTHER') {
    warnings.push('No deterministic account-opening document type matched.');
  }

  if (confidence !== 'HIGH') {
    warnings.push('Low-confidence documents must stay in operator review.');
  }

  if (
    [
      'DIRECT_DEBIT_MANDATE',
      'BANK_MANDATE',
      'DIRECTOR_GUARANTEE',
      'REGULATORY_DECLARATION',
      'GDP_QUESTIONNAIRE',
      'CREDIT_APPLICATION',
    ].includes(classification)
  ) {
    warnings.push(
      'This document type contains review-required or blocked fields and cannot be automatically completed.',
    );
  }

  return {
    sourceEvidenceId: input.sourceEvidenceId ?? null,
    fileName: input.fileName?.trim() || null,
    classification,
    confidence,
    score,
    matchedEvidence,
    missingEvidence,
    warnings,
    safeForAutomaticCompletion: false,
  };
}

export function classifyAccountOpeningDocuments(
  inputs: ClassificationInput[],
): AccountOpeningDocumentClassification[] {
  return inputs.map(classifyAccountOpeningDocument);
}
