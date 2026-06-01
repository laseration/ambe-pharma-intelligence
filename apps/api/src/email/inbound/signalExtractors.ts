import type {
  ClassificationEvidence,
  ClassificationEvidenceSource,
} from './types';

export const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
]);

export function normaliseText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function extractEmailAddresses(
  value: string | null | undefined,
): string[] {
  const matches = value?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return Array.from(new Set(matches.map((email) => email.toLowerCase())));
}

export function extractDomainFromEmail(
  email: string | null | undefined,
): string | null {
  const normalised = normaliseText(email);
  const atIndex = normalised.lastIndexOf('@');

  if (atIndex < 0) {
    return null;
  }

  const domain = normalised.slice(atIndex + 1).replace(/[>),.;]+$/g, '');
  return domain || null;
}

export function isGenericEmailDomain(
  domain: string | null | undefined,
): boolean {
  return Boolean(domain && GENERIC_EMAIL_DOMAINS.has(domain.toLowerCase()));
}

export function canonicalPhone(
  value: string | null | undefined,
): string | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  const digits = raw.replace(/[^\d+]/g, '');
  const digitCount = digits.replace(/\D/g, '').length;
  return digitCount >= 7 ? digits : null;
}

export function extractPhoneNumbers(
  value: string | null | undefined,
): string[] {
  const matches = value?.match(/(?:\+?\d[\d\s().-]{6,}\d)/g) ?? [];
  return Array.from(
    new Set(
      matches
        .map(canonicalPhone)
        .filter((phone): phone is string => Boolean(phone)),
    ),
  );
}

export function safeSnippet(
  value: string | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const compact = value
    .replace(/\b\d{2}-\d{2}-\d{2}\b/g, '[sort-code-redacted]')
    .replace(/\b\d{8}\b/g, '[account-number-redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email-redacted]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[phone-redacted]')
    .replace(/\s+/g, ' ')
    .trim();

  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

export function evidence(
  source: ClassificationEvidenceSource,
  signal: string,
  weight: number,
  snippet?: string | null,
  options?: { attachmentId?: string; page?: number },
): ClassificationEvidence {
  return {
    source,
    signal,
    weight,
    snippet: safeSnippet(snippet),
    ...(options?.attachmentId ? { attachmentId: options.attachmentId } : {}),
    ...(options?.page ? { page: options.page } : {}),
  };
}

export function normaliseHeaderName(value: string): string {
  return value.trim().toLowerCase();
}
