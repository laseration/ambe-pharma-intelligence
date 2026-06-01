export type CorrelationInput = {
  sourceSystem?: string | null;
  externalMessageId?: string | null;
  messageId?: string | null;
  internetMessageId?: string | null;
  sourceFingerprint?: string | null;
};

function cleanToken(value: string | null | undefined): string | null {
  const cleaned = value?.replace(/[\r\n\t]/g, ' ').trim();
  return cleaned ? cleaned : null;
}

function cleanSourceSystem(value: string | null | undefined): string {
  const cleaned = cleanToken(value)
    ?.replace(/[^A-Za-z0-9_-]/g, '_')
    .toUpperCase();

  return cleaned || 'SOURCE';
}

export function buildCorrelationId(input: CorrelationInput): string | null {
  const externalMessageId = cleanToken(input.externalMessageId);

  if (externalMessageId) {
    return `${cleanSourceSystem(input.sourceSystem)}:${externalMessageId}`;
  }

  const messageId =
    cleanToken(input.messageId) ?? cleanToken(input.internetMessageId);

  if (messageId) {
    return `MESSAGE:${messageId}`;
  }

  const sourceFingerprint = cleanToken(input.sourceFingerprint);

  if (sourceFingerprint) {
    return `FINGERPRINT:${sourceFingerprint.slice(0, 16)}`;
  }

  return null;
}

export function correlationLogMeta(input: CorrelationInput): {
  correlationId?: string;
} {
  const correlationId = buildCorrelationId(input);

  return correlationId ? { correlationId } : {};
}
