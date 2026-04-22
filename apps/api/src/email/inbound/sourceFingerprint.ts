import { createHash } from 'node:crypto';

function toHash(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

export function normalizeFingerprintText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function extractSenderDomain(senderEmail: string | null | undefined): string | null {
  const normalized = normalizeFingerprintText(senderEmail);
  const atIndex = normalized.lastIndexOf('@');

  if (atIndex < 0) {
    return null;
  }

  const domain = normalized.slice(atIndex + 1).trim();
  return domain || null;
}

function shapeSubject(subject: string | null | undefined): string {
  return normalizeFingerprintText(subject)
    .replace(/\b(?:re|fw|fwd)\s*:/g, 'prefix')
    .replace(/\d+/g, '#')
    .replace(/[A-Z]{2,}/g, 'token')
    .replace(/[^a-z# ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAttachmentTypes(attachmentSummary: unknown): string[] {
  if (!Array.isArray(attachmentSummary)) {
    return [];
  }

  return attachmentSummary
    .map((attachment) => {
      if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
        return null;
      }

      const record = attachment as Record<string, unknown>;
      const mimeType =
        typeof record.mimeType === 'string' && record.mimeType.trim()
          ? record.mimeType.trim().toLowerCase()
          : null;
      const fileName =
        typeof record.fileName === 'string' && record.fileName.trim()
          ? record.fileName.trim().toLowerCase()
          : null;

      if (mimeType) {
        return mimeType;
      }

      if (!fileName || !fileName.includes('.')) {
        return null;
      }

      return fileName.slice(fileName.lastIndexOf('.') + 1);
    })
    .filter((value): value is string => Boolean(value))
    .sort();
}

function normalizeBodyStructure(bodyText: string | null | undefined): string {
  return normalizeFingerprintText(bodyText)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'email')
    .replace(/https?:\/\/\S+/gi, 'url')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, 'phone')
    .replace(/\b(?:gbp|usd|eur)\b/gi, 'currency')
    .replace(/\d+(?:\.\d+)?/g, '#')
    .replace(/\b(?:from|sent|to|subject):/gi, 'header')
    .replace(/[^a-z# ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSourceTemplateFingerprint(input: {
  sourceSystem: string | null | undefined;
  senderEmail: string | null | undefined;
  subject: string | null | undefined;
  documentKinds?: string[] | null | undefined;
  attachmentSummary?: unknown;
  bodyText?: string | null | undefined;
}): string {
  const sourceSystem = normalizeFingerprintText(input.sourceSystem) || 'microsoft_graph';
  const senderDomain = extractSenderDomain(input.senderEmail) ?? 'unknown-domain';
  const subjectShape = shapeSubject(input.subject);
  const documentKinds = Array.from(new Set((input.documentKinds ?? []).map(normalizeFingerprintText)))
    .filter(Boolean)
    .sort();
  const attachmentTypes = normalizeAttachmentTypes(input.attachmentSummary);
  const bodyStructureHash = toHash(normalizeBodyStructure(input.bodyText));

  return toHash(
    [
      sourceSystem,
      senderDomain,
      subjectShape,
      documentKinds.join(','),
      attachmentTypes.join(','),
      bodyStructureHash,
    ].join('|'),
  );
}
