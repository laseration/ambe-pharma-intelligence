import {
  extractDomainFromEmail,
  extractEmailAddresses,
  extractPhoneNumbers,
  isGenericEmailDomain,
  normaliseText,
  safeSnippet,
} from './signalExtractors';
import {
  normaliseInternetMessageHeaders,
  parseForwardedHeaderBlocks,
} from './forwardHeaderParser';
import type { DocumentClassifierSupplierMapping } from './documentClassifier';
import type { Rfc5322Header } from './types';

export type SupplierContactEvidenceSource =
  | 'TRUSTED_MAPPING'
  | 'FROM'
  | 'SENDER'
  | 'REPLY_TO'
  | 'RFC5322_HEADER'
  | 'FORWARDED_HEADER'
  | 'SIGNATURE'
  | 'ATTACHMENT_ROW'
  | 'ATTACHMENT_NAME'
  | 'ATTACHMENT_TEXT';

export type SupplierContactEvidenceItem = {
  sourceType: SupplierContactEvidenceSource;
  fieldName:
    | 'supplierNameCandidate'
    | 'contactName'
    | 'contactEmail'
    | 'contactPhoneRaw'
    | 'contactRole';
  rawValue: string;
  normalizedValue?: string;
  confidenceContribution: number;
  snippet?: string;
  attachmentId?: string;
  sourceDocumentId?: string;
  pageNumber?: number;
};

export type SupplierContactExtractionInput = {
  fromEmail?: string | null;
  fromName?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  replyTo?: Array<{ email: string; name?: string | null }> | null;
  internetMessageHeaders?: Rfc5322Header[] | null;
  bodyText?: string | null;
  attachmentRows?: Array<{
    attachmentId?: string | null;
    sourceDocumentId?: string | null;
    row: Record<string, unknown>;
  }>;
  attachmentTexts?: Array<{
    attachmentId?: string | null;
    sourceDocumentId?: string | null;
    text?: string | null;
    pageNumber?: number | null;
  }>;
  attachmentFileNames?: Array<{
    attachmentId?: string | null;
    fileName?: string | null;
  }>;
  supplierMappings?: DocumentClassifierSupplierMapping[];
  internalDomains?: string[];
  previouslyApprovedContact?: {
    contactEmail?: string | null;
    normalizedSupplierName?: string | null;
  } | null;
};

export type SupplierContactExtractionResult = {
  supplierNameCandidate: string | null;
  normalizedSupplierName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhoneRaw: string | null;
  contactPhoneCanonical: string | null;
  contactRole: string | null;
  confidence: number;
  status: 'STAGED' | 'AUTO_ACCEPTED' | 'APPROVED' | 'REJECTED';
  autoAttached: boolean;
  evidence: SupplierContactEvidenceItem[];
  conflicts: string[];
  reason: string;
};

export type SupplierContactExtractionCandidate =
  SupplierContactExtractionResult;

const SUPPLIER_NAME_PATTERN =
  /\b([A-Z][A-Za-z0-9&.,' -]{1,70}?(?:pharma|pharmaceuticals|laboratories|labs|healthcare|health|medical|wholesale|trading|ltd|limited|gmbh|bv|nv|plc|inc|llc|corp|company|co)\b)\.?/i;
const ROLE_PATTERN =
  /\b(account\s+manager|sales\s+manager|commercial\s+manager|customer\s+service|sales|accounts|business\s+development)\b/i;

export function extractSupplierContact(
  input: SupplierContactExtractionInput,
): SupplierContactExtractionResult {
  const evidence: SupplierContactEvidenceItem[] = [];
  const conflicts: string[] = [];
  const internalDomains = new Set(
    (input.internalDomains ?? []).map(normaliseDomain),
  );

  addMappingEvidence(input, evidence);
  addAddressEvidence(
    'FROM',
    input.fromEmail,
    input.fromName,
    evidence,
    internalDomains,
  );
  addAddressEvidence(
    'SENDER',
    input.senderEmail,
    input.senderName,
    evidence,
    internalDomains,
  );
  for (const reply of input.replyTo ?? []) {
    addAddressEvidence(
      'REPLY_TO',
      reply.email,
      reply.name,
      evidence,
      internalDomains,
    );
  }

  for (const header of normaliseInternetMessageHeaders(
    input.internetMessageHeaders,
  )) {
    if (!['from', 'sender', 'reply-to', 'resent-from'].includes(header.name)) {
      continue;
    }
    for (const email of header.emails) {
      addAddressEvidence(
        'RFC5322_HEADER',
        email,
        null,
        evidence,
        internalDomains,
        header.value,
      );
    }
  }

  for (const header of parseForwardedHeaderBlocks(input.bodyText)) {
    if (!['from', 'sender', 'reply-to', 'resent-from'].includes(header.name)) {
      continue;
    }
    for (const email of header.emails) {
      addAddressEvidence(
        'FORWARDED_HEADER',
        email,
        null,
        evidence,
        internalDomains,
        header.value,
      );
    }
  }

  addSignatureEvidence(input.bodyText, evidence);
  addAttachmentRowEvidence(input.attachmentRows ?? [], evidence);
  addAttachmentTextEvidence(input.attachmentTexts ?? [], evidence);
  addAttachmentFileNameEvidence(input.attachmentFileNames ?? [], evidence);

  const supplierNames = weightedValues(evidence, 'supplierNameCandidate');
  const contactEmails = weightedValues(evidence, 'contactEmail');
  const contactNames = weightedValues(evidence, 'contactName');
  const phones = weightedValues(evidence, 'contactPhoneRaw');
  const roles = weightedValues(evidence, 'contactRole');

  const selectedSupplier =
    supplierNames.length > 1
      ? recordConflict(conflicts, 'supplier name')
      : selectUnambiguous(supplierNames, conflicts, 'supplier name');
  const selectedEmail = selectUnambiguous(
    contactEmails,
    conflicts,
    'contact email',
  );
  const selectedName = selectUnambiguous(
    contactNames,
    conflicts,
    'contact name',
  );
  const selectedPhone = selectUnambiguous(phones, conflicts, 'contact phone');
  const selectedRole = selectUnambiguous(roles, conflicts, 'contact role');

  if (
    input.previouslyApprovedContact?.contactEmail &&
    selectedEmail &&
    normaliseText(input.previouslyApprovedContact.contactEmail) !==
      normaliseText(selectedEmail)
  ) {
    conflicts.push(
      'extracted contact email differs from previously approved contact',
    );
  }

  const confidence = Math.min(
    100,
    evidence.reduce((sum, item) => sum + item.confidenceContribution, 0),
  );
  const safe = conflicts.length === 0 && confidence >= 70 && selectedSupplier;

  return {
    supplierNameCandidate: selectedSupplier,
    normalizedSupplierName: selectedSupplier
      ? normalizeSupplierName(selectedSupplier)
      : null,
    contactName: selectedName,
    contactEmail: selectedEmail,
    contactPhoneRaw: selectedPhone,
    contactPhoneCanonical: selectedPhone
      ? (extractPhoneNumbers(selectedPhone)[0] ?? null)
      : null,
    contactRole: selectedRole,
    confidence,
    status: 'STAGED',
    autoAttached: false,
    evidence,
    conflicts,
    reason: safe
      ? 'Supplier contact candidate staged with deterministic provenance; operator approval is still required.'
      : 'Supplier contact candidate requires review because identity evidence is weak, generic, internal, or conflicting.',
  };
}

function addMappingEvidence(
  input: SupplierContactExtractionInput,
  evidence: SupplierContactEvidenceItem[],
) {
  const fromDomain = extractDomainFromEmail(input.fromEmail);
  if (!fromDomain) {
    return;
  }

  for (const mapping of input.supplierMappings ?? []) {
    const mappingDomain = normaliseDomain(mapping.domain ?? mapping.pattern);
    if (!mappingDomain || !domainMatches(fromDomain, mappingDomain)) {
      continue;
    }
    if (mapping.supplierName) {
      evidence.push(
        contactEvidence(
          'TRUSTED_MAPPING',
          'supplierNameCandidate',
          mapping.supplierName,
          45,
          mapping.supplierName,
        ),
      );
    }
  }
}

function addAddressEvidence(
  sourceType: SupplierContactEvidenceSource,
  email: string | null | undefined,
  name: string | null | undefined,
  evidence: SupplierContactEvidenceItem[],
  internalDomains: Set<string>,
  snippet?: string | null,
) {
  const domain = extractDomainFromEmail(email);
  if (
    !email ||
    !domain ||
    internalDomains.has(domain) ||
    isGenericEmailDomain(domain)
  ) {
    return;
  }

  evidence.push(
    contactEvidence(sourceType, 'contactEmail', email, 18, snippet ?? email),
  );

  const supplierFromDomain = supplierNameFromDomain(domain);
  if (supplierFromDomain) {
    evidence.push(
      contactEvidence(
        sourceType,
        'supplierNameCandidate',
        supplierFromDomain,
        14,
        snippet ?? domain,
      ),
    );
  }

  if (name && !looksGenericName(name)) {
    evidence.push(
      contactEvidence(sourceType, 'contactName', name, 8, snippet ?? name),
    );
  }
}

function addSignatureEvidence(
  bodyText: string | null | undefined,
  evidence: SupplierContactEvidenceItem[],
) {
  const body = bodyText ?? '';
  const signatureMatch = body.match(
    /(?:^|\n)\s*(?:kind regards|best regards|regards|thanks|many thanks)[,\s]*\n([\s\S]+)$/i,
  );
  const signature = signatureMatch?.[1];
  if (!signature) {
    return;
  }

  const email = extractEmailAddresses(signature)[0];
  if (email) {
    evidence.push(
      contactEvidence('SIGNATURE', 'contactEmail', email, 14, signature),
    );
  }

  const phone = extractPhoneNumbers(signature)[0];
  if (phone) {
    evidence.push(
      contactEvidence('SIGNATURE', 'contactPhoneRaw', phone, 8, signature),
    );
  }

  const role = signature.match(ROLE_PATTERN)?.[1];
  if (role) {
    evidence.push(
      contactEvidence('SIGNATURE', 'contactRole', role, 6, signature),
    );
  }

  const supplier = signature.match(SUPPLIER_NAME_PATTERN)?.[1];
  if (supplier) {
    evidence.push(
      contactEvidence(
        'SIGNATURE',
        'supplierNameCandidate',
        supplier,
        10,
        signature,
      ),
    );
  }
}

function addAttachmentRowEvidence(
  rows: NonNullable<SupplierContactExtractionInput['attachmentRows']>,
  evidence: SupplierContactEvidenceItem[],
) {
  for (const { row, attachmentId, sourceDocumentId } of rows) {
    for (const [key, value] of Object.entries(row)) {
      const raw = String(value ?? '').trim();
      if (!raw) {
        continue;
      }
      if (
        /supplier|vendor|company/i.test(key) &&
        SUPPLIER_NAME_PATTERN.test(raw)
      ) {
        evidence.push(
          contactEvidence(
            'ATTACHMENT_ROW',
            'supplierNameCandidate',
            raw,
            30,
            raw,
            attachmentId,
            sourceDocumentId,
          ),
        );
      }
      if (/email/i.test(key) && extractEmailAddresses(raw)[0]) {
        evidence.push(
          contactEvidence(
            'ATTACHMENT_ROW',
            'contactEmail',
            extractEmailAddresses(raw)[0]!,
            14,
            raw,
            attachmentId,
            sourceDocumentId,
          ),
        );
      }
      if (/phone|tel|mobile/i.test(key) && extractPhoneNumbers(raw)[0]) {
        evidence.push(
          contactEvidence(
            'ATTACHMENT_ROW',
            'contactPhoneRaw',
            raw,
            8,
            raw,
            attachmentId,
            sourceDocumentId,
          ),
        );
      }
      if (/role|title|position/i.test(key) && ROLE_PATTERN.test(raw)) {
        evidence.push(
          contactEvidence(
            'ATTACHMENT_ROW',
            'contactRole',
            raw,
            5,
            raw,
            attachmentId,
            sourceDocumentId,
          ),
        );
      }
    }
  }
}

function addAttachmentTextEvidence(
  texts: NonNullable<SupplierContactExtractionInput['attachmentTexts']>,
  evidence: SupplierContactEvidenceItem[],
) {
  for (const text of texts) {
    const value = text.text ?? '';
    const supplier = value.match(SUPPLIER_NAME_PATTERN)?.[1];
    if (supplier) {
      evidence.push(
        contactEvidence(
          'ATTACHMENT_TEXT',
          'supplierNameCandidate',
          supplier,
          8,
          value,
          text.attachmentId,
          text.sourceDocumentId,
          text.pageNumber ?? undefined,
        ),
      );
    }
  }
}

function addAttachmentFileNameEvidence(
  files: NonNullable<SupplierContactExtractionInput['attachmentFileNames']>,
  evidence: SupplierContactEvidenceItem[],
) {
  for (const file of files) {
    const name = file.fileName ?? '';
    const supplier = name.match(SUPPLIER_NAME_PATTERN)?.[1];
    if (supplier) {
      evidence.push(
        contactEvidence(
          'ATTACHMENT_NAME',
          'supplierNameCandidate',
          supplier,
          4,
          name,
          file.attachmentId,
        ),
      );
    }
  }
}

function contactEvidence(
  sourceType: SupplierContactEvidenceSource,
  fieldName: SupplierContactEvidenceItem['fieldName'],
  rawValue: string,
  confidenceContribution: number,
  snippet?: string | null,
  attachmentId?: string | null,
  sourceDocumentId?: string | null,
  pageNumber?: number,
): SupplierContactEvidenceItem {
  return {
    sourceType,
    fieldName,
    rawValue,
    normalizedValue:
      fieldName === 'supplierNameCandidate'
        ? normalizeSupplierName(rawValue)
        : normaliseText(rawValue),
    confidenceContribution,
    snippet: safeSnippet(snippet),
    ...(attachmentId ? { attachmentId } : {}),
    ...(sourceDocumentId ? { sourceDocumentId } : {}),
    ...(pageNumber ? { pageNumber } : {}),
  };
}

function weightedValues(
  evidence: SupplierContactEvidenceItem[],
  fieldName: SupplierContactEvidenceItem['fieldName'],
) {
  const totals = new Map<string, { raw: string; score: number }>();
  for (const item of evidence.filter(
    (entry) => entry.fieldName === fieldName,
  )) {
    const key = item.normalizedValue ?? normaliseText(item.rawValue);
    const current = totals.get(key) ?? { raw: item.rawValue, score: 0 };
    current.score += item.confidenceContribution;
    totals.set(key, current);
  }
  return Array.from(totals.values()).sort(
    (left, right) => right.score - left.score,
  );
}

function selectUnambiguous(
  values: Array<{ raw: string; score: number }>,
  conflicts: string[],
  label: string,
): string | null {
  const [top, second] = values;
  if (!top) {
    return null;
  }
  if (second && second.score >= top.score - 8) {
    conflicts.push(`conflicting ${label} evidence`);
    return null;
  }
  return top.raw;
}

function recordConflict(conflicts: string[], label: string): null {
  conflicts.push(`conflicting ${label} evidence`);
  return null;
}

function supplierNameFromDomain(domain: string): string | null {
  if (isGenericEmailDomain(domain)) {
    return null;
  }
  const first = domain.split('.')[0] ?? '';
  if (
    !first ||
    ['mail', 'email', 'sales', 'accounts', 'info'].includes(first)
  ) {
    return null;
  }
  return first
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeSupplierName(value: string): string {
  return normaliseText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function looksGenericName(value: string): boolean {
  return /^(sales|info|accounts|orders|customer service)$/i.test(value.trim());
}

function normaliseDomain(value: string | null | undefined): string {
  return normaliseText(value).replace(/^@/, '').replace(/^\*\./, '');
}

function domainMatches(senderDomain: string, mappingDomain: string): boolean {
  return (
    senderDomain === mappingDomain || senderDomain.endsWith(`.${mappingDomain}`)
  );
}
