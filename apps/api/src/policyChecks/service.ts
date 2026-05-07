import { createHash } from 'node:crypto';

type PolicyScope = 'STAGED_OFFER' | 'OUTBOUND_DRAFT';
type PolicyDirection = 'TO_SUPPLIER' | 'TO_BUYER' | 'INTERNAL' | 'UNKNOWN';
export type PolicyFindingSeverity = 'INFO' | 'WARNING' | 'BLOCKING';

export type PolicyTextPart = {
  label: string;
  text: string | null | undefined;
};

export type PolicyCheckFinding = {
  code: string;
  category:
    | 'SUPPLIER_IDENTITY'
    | 'BUYER_IDENTITY'
    | 'CONTACT_DETAIL'
    | 'LOCATION'
    | 'PAYMENT_DETAIL'
    | 'ATTACHMENT_FILENAME'
    | 'METADATA'
    | 'FORWARDED_CONTENT';
  severity: PolicyFindingSeverity;
  blocking: boolean;
  label: string;
  evidence: string;
  sourceLabel: string;
};

export type PolicyCheckInput = {
  scope: PolicyScope;
  direction?: PolicyDirection;
  textParts: PolicyTextPart[];
  supplierTerms?: Array<string | null | undefined>;
  buyerTerms?: Array<string | null | undefined>;
  attachmentFileNames?: Array<string | null | undefined>;
  metadata?: unknown;
};

export type PolicyCheckSummary = {
  status: 'PASSED' | 'FINDINGS' | 'BLOCKED';
  summary: string;
  findings: PolicyCheckFinding[];
  blockingFindingCount: number;
  fingerprint: string;
  flags: {
    containsSupplierIdentity: boolean;
    containsBuyerIdentity: boolean;
    containsExternalContactDetails: boolean;
    containsForwardedContent: boolean;
    containsPaymentDetails: boolean;
    containsAddressOrLocation: boolean;
    containsAttachmentIdentityLeak: boolean;
    containsMetadataLeakage: boolean;
  };
};

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/g;
const URL_PATTERN = /https?:\/\/|www\./i;
const FORWARDED_HEADER_PATTERN = /(^|\n)\s*(from|sent|to|subject|cc|bcc):/i;
const BANK_PATTERN =
  /\b(?:iban|swift|bic|sort\s*code|account\s*(?:no|number)|bank\s*(?:details|transfer|account)|payment\s*(?:terms|details)|vat\s*(?:no|number)|routing\s*number)\b/i;
const ADDRESS_PATTERN =
  /\b(?:street|st\.|road|rd\.|avenue|ave\.|lane|industrial estate|trading estate|business park|postcode|post code|uk|united kingdom|london|birmingham|manchester|glasgow|leeds|liverpool|bristol|sheffield|cardiff)\b/i;

function normalizeString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeTerm(value: string | null | undefined): string | null {
  const normalized = normalizeString(value)
    ?.replace(/\s+/g, ' ')
    .replace(/^[<("'`]+|[>)"'`.,:;]+$/g, '');
  return normalized && normalized.length >= 3 ? normalized : null;
}

function uniqueTerms(values: Array<string | null | undefined> | undefined): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const value of values ?? []) {
    const term = normalizeTerm(value);
    if (!term) {
      continue;
    }

    const key = term.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    terms.push(term);
  }

  return terms;
}

function compactEvidence(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function findingSeverityForIdentity(
  scope: PolicyScope,
  direction: PolicyDirection,
  identityType: 'SUPPLIER' | 'BUYER',
): PolicyFindingSeverity {
  if (scope === 'STAGED_OFFER') {
    return 'WARNING';
  }

  if (identityType === 'SUPPLIER' && direction === 'TO_BUYER') {
    return 'BLOCKING';
  }

  if (identityType === 'BUYER' && direction === 'TO_SUPPLIER') {
    return 'BLOCKING';
  }

  return 'WARNING';
}

function severityIsBlocking(severity: PolicyFindingSeverity): boolean {
  return severity === 'BLOCKING';
}

function addFinding(
  findings: PolicyCheckFinding[],
  seen: Set<string>,
  finding: Omit<PolicyCheckFinding, 'blocking'>,
) {
  const key = [
    finding.code,
    finding.category,
    finding.sourceLabel,
    finding.evidence.toLowerCase(),
  ].join('|');

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  findings.push({
    ...finding,
    blocking: severityIsBlocking(finding.severity),
  });
}

function scanTerms(
  input: {
    scope: PolicyScope;
    direction: PolicyDirection;
    textPart: PolicyTextPart;
    terms: string[];
    identityType: 'SUPPLIER' | 'BUYER';
  },
  findings: PolicyCheckFinding[],
  seen: Set<string>,
) {
  const text = input.textPart.text ?? '';
  const lowerText = text.toLowerCase();

  for (const term of input.terms) {
    if (!lowerText.includes(term.toLowerCase())) {
      continue;
    }

    const severity = findingSeverityForIdentity(input.scope, input.direction, input.identityType);
    addFinding(findings, seen, {
      code:
        input.identityType === 'SUPPLIER'
          ? 'supplier_identity_detected'
          : 'buyer_identity_detected',
      category:
        input.identityType === 'SUPPLIER'
          ? 'SUPPLIER_IDENTITY'
          : 'BUYER_IDENTITY',
      severity,
      label:
        input.identityType === 'SUPPLIER'
          ? 'Supplier identity appears in text'
          : 'Buyer identity appears in text',
      evidence: term,
      sourceLabel: input.textPart.label,
    });
  }
}

function scanPattern(
  input: {
    textPart: PolicyTextPart;
    pattern: RegExp;
    code: string;
    category: PolicyCheckFinding['category'];
    severity: PolicyFindingSeverity;
    label: string;
    firstMatchOnly?: boolean;
  },
  findings: PolicyCheckFinding[],
  seen: Set<string>,
) {
  const text = input.textPart.text ?? '';
  const pattern = new RegExp(input.pattern.source, input.pattern.flags.includes('g') ? input.pattern.flags : `${input.pattern.flags}g`);
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    addFinding(findings, seen, {
      code: input.code,
      category: input.category,
      severity: input.severity,
      label: input.label,
      evidence: compactEvidence(match[0]),
      sourceLabel: input.textPart.label,
    });

    if (input.firstMatchOnly) {
      break;
    }
  }
}

function scanAttachmentNames(
  input: {
    scope: PolicyScope;
    direction: PolicyDirection;
    fileNames: string[];
    supplierTerms: string[];
    buyerTerms: string[];
  },
  findings: PolicyCheckFinding[],
  seen: Set<string>,
) {
  for (const fileName of input.fileNames) {
    const lower = fileName.toLowerCase();
    const matchedSupplier = input.supplierTerms.find((term) => lower.includes(term.toLowerCase()));
    const matchedBuyer = input.buyerTerms.find((term) => lower.includes(term.toLowerCase()));
    const containsEmail = EMAIL_PATTERN.test(fileName);
    EMAIL_PATTERN.lastIndex = 0;

    const identityTerm = matchedSupplier ?? matchedBuyer ?? null;
    if (!identityTerm && !containsEmail) {
      continue;
    }

    const identityType = matchedBuyer ? 'BUYER' : 'SUPPLIER';
    const severity =
      containsEmail || input.scope === 'OUTBOUND_DRAFT'
        ? 'BLOCKING'
        : findingSeverityForIdentity(input.scope, input.direction, identityType);

    addFinding(findings, seen, {
      code: 'attachment_filename_identity_leak',
      category: 'ATTACHMENT_FILENAME',
      severity,
      label: 'Attachment filename may reveal an identity',
      evidence: identityTerm ? `${fileName} (${identityTerm})` : fileName,
      sourceLabel: 'attachment filename',
    });
  }
}

function metadataContainsLeakage(metadata: unknown, supplierTerms: string[], buyerTerms: string[]): string | null {
  if (metadata === null || metadata === undefined) {
    return null;
  }

  const text = JSON.stringify(metadata);
  const lower = text.toLowerCase();

  if (EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text) || BANK_PATTERN.test(text)) {
    EMAIL_PATTERN.lastIndex = 0;
    PHONE_PATTERN.lastIndex = 0;
    return compactEvidence(text);
  }

  EMAIL_PATTERN.lastIndex = 0;
  PHONE_PATTERN.lastIndex = 0;

  const matchedTerm = [...supplierTerms, ...buyerTerms].find((term) => lower.includes(term.toLowerCase()));
  return matchedTerm ? matchedTerm : null;
}

export function runBlindBrokerPolicyCheck(input: PolicyCheckInput): PolicyCheckSummary {
  const direction = input.direction ?? 'UNKNOWN';
  const supplierTerms = uniqueTerms(input.supplierTerms);
  const buyerTerms = uniqueTerms(input.buyerTerms);
  const fileNames = uniqueTerms(input.attachmentFileNames);
  const findings: PolicyCheckFinding[] = [];
  const seen = new Set<string>();

  for (const textPart of input.textParts) {
    if (!normalizeString(textPart.text)) {
      continue;
    }

    scanTerms(
      {
        scope: input.scope,
        direction,
        textPart,
        terms: supplierTerms,
        identityType: 'SUPPLIER',
      },
      findings,
      seen,
    );
    scanTerms(
      {
        scope: input.scope,
        direction,
        textPart,
        terms: buyerTerms,
        identityType: 'BUYER',
      },
      findings,
      seen,
    );

    scanPattern(
      {
        textPart,
        pattern: EMAIL_PATTERN,
        code: 'email_address_detected',
        category: 'CONTACT_DETAIL',
        severity: input.scope === 'OUTBOUND_DRAFT' ? 'BLOCKING' : 'WARNING',
        label: 'Email address appears in text',
      },
      findings,
      seen,
    );
    scanPattern(
      {
        textPart,
        pattern: PHONE_PATTERN,
        code: 'phone_number_detected',
        category: 'CONTACT_DETAIL',
        severity: input.scope === 'OUTBOUND_DRAFT' ? 'BLOCKING' : 'WARNING',
        label: 'Phone number appears in text',
      },
      findings,
      seen,
    );
    scanPattern(
      {
        textPart,
        pattern: URL_PATTERN,
        code: 'web_link_detected',
        category: 'CONTACT_DETAIL',
        severity: input.scope === 'OUTBOUND_DRAFT' ? 'BLOCKING' : 'WARNING',
        label: 'Web link appears in text',
        firstMatchOnly: true,
      },
      findings,
      seen,
    );
    scanPattern(
      {
        textPart,
        pattern: FORWARDED_HEADER_PATTERN,
        code: 'forwarded_header_content_detected',
        category: 'FORWARDED_CONTENT',
        severity: input.scope === 'OUTBOUND_DRAFT' ? 'BLOCKING' : 'WARNING',
        label: 'Forwarded header content appears in text',
        firstMatchOnly: true,
      },
      findings,
      seen,
    );
    scanPattern(
      {
        textPart,
        pattern: BANK_PATTERN,
        code: 'bank_payment_details_detected',
        category: 'PAYMENT_DETAIL',
        severity: 'BLOCKING',
        label: 'Bank or payment detail appears in text',
        firstMatchOnly: true,
      },
      findings,
      seen,
    );
    scanPattern(
      {
        textPart,
        pattern: ADDRESS_PATTERN,
        code: 'address_or_location_detected',
        category: 'LOCATION',
        severity: input.scope === 'OUTBOUND_DRAFT' ? 'BLOCKING' : 'WARNING',
        label: 'Address or location cue appears in text',
        firstMatchOnly: true,
      },
      findings,
      seen,
    );
  }

  scanAttachmentNames(
    {
      scope: input.scope,
      direction,
      fileNames,
      supplierTerms,
      buyerTerms,
    },
    findings,
    seen,
  );

  const metadataLeak = metadataContainsLeakage(input.metadata, supplierTerms, buyerTerms);
  if (metadataLeak) {
    addFinding(findings, seen, {
      code: 'metadata_identity_leak',
      category: 'METADATA',
      severity: input.scope === 'OUTBOUND_DRAFT' ? 'BLOCKING' : 'WARNING',
      label: 'Metadata may contain an identity or contact detail',
      evidence: metadataLeak,
      sourceLabel: 'metadata',
    });
  }

  const blockingFindingCount = findings.filter((finding) => finding.blocking).length;
  const status =
    blockingFindingCount > 0 ? 'BLOCKED' : findings.length > 0 ? 'FINDINGS' : 'PASSED';
  const summary =
    status === 'PASSED'
      ? 'No blind-broker policy findings were detected.'
      : status === 'BLOCKED'
        ? `${blockingFindingCount} blocking blind-broker policy finding${blockingFindingCount === 1 ? '' : 's'} detected.`
        : `${findings.length} non-blocking blind-broker policy finding${findings.length === 1 ? '' : 's'} detected.`;
  const flags = {
    containsSupplierIdentity: findings.some((finding) => finding.category === 'SUPPLIER_IDENTITY'),
    containsBuyerIdentity: findings.some((finding) => finding.category === 'BUYER_IDENTITY'),
    containsExternalContactDetails: findings.some((finding) => finding.category === 'CONTACT_DETAIL'),
    containsForwardedContent: findings.some((finding) => finding.category === 'FORWARDED_CONTENT'),
    containsPaymentDetails: findings.some((finding) => finding.category === 'PAYMENT_DETAIL'),
    containsAddressOrLocation: findings.some((finding) => finding.category === 'LOCATION'),
    containsAttachmentIdentityLeak: findings.some((finding) => finding.category === 'ATTACHMENT_FILENAME'),
    containsMetadataLeakage: findings.some((finding) => finding.category === 'METADATA'),
  };

  return {
    status,
    summary,
    findings,
    blockingFindingCount,
    fingerprint: createHash('sha256')
      .update(JSON.stringify({ status, findings, flags }))
      .digest('hex'),
    flags,
  };
}
