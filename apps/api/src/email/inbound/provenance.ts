import { createHash } from 'node:crypto';

import type { EmailAttachmentInput } from './types';

export function attachmentContentBuffer(
  content: EmailAttachmentInput['content'],
): Buffer | null {
  if (content == null) {
    return null;
  }

  return Buffer.isBuffer(content) ? content : Buffer.from(content);
}

export function attachmentChecksumSha256(
  attachment: EmailAttachmentInput,
): string | null {
  const buffer = attachmentContentBuffer(attachment.content);

  if (!buffer) {
    return null;
  }

  return createHash('sha256').update(buffer).digest('hex');
}

export function attachmentMetadataFingerprint(
  attachment: EmailAttachmentInput,
): string {
  const checksum = attachmentChecksumSha256(attachment);
  const stableParts = [
    attachment.fileName ?? '',
    attachment.mimeType ?? '',
    attachment.size ?? '',
    attachment.contentId ?? '',
    attachment.disposition ?? '',
    checksum ?? '',
  ];

  return createHash('sha256').update(stableParts.join('|')).digest('hex');
}

export function safeSubjectPreview(
  subject: string | null | undefined,
  maxLength = 120,
): string | null {
  const normalized = subject?.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}...`
    : normalized;
}

export function safeSenderDomain(
  email: string | null | undefined,
): string | null {
  const domain = email?.split('@')[1]?.trim().toLowerCase();
  return domain || null;
}
