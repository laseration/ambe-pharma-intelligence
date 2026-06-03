const REDACTED = '[redacted]';
const MAX_SAFE_STRING_LENGTH = 1200;
const MAX_SAFE_DEPTH = 6;

const SENSITIVE_KEY_PATTERNS = [
  /authorization/i,
  /cookie/i,
  /password/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /client[-_]?secret/i,
  /database[-_]?url/i,
  /connection[-_]?string/i,
  /^body$/i,
  /body[-_]?text/i,
  /body[-_]?html/i,
  /message[-_]?body/i,
  /raw[-_]?body/i,
  /raw[-_]?text/i,
  /file[-_]?content/i,
  /content[-_]?bytes/i,
  /attachment[-_]?content/i,
  /^payload$/i,
  /raw[-_]?payload/i,
  /graph[-_]?payload/i,
  /telegram[-_]?payload/i,
  /update[-_]?payload/i,
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Error)
  );
}

export function isSensitiveOutputKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function redactEmailAddress(value: string): string {
  const trimmed = value.trim();
  const atIndex = trimmed.lastIndexOf('@');

  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return trimmed ? '[redacted-email]' : '';
  }

  return `***@${trimmed.slice(atIndex + 1).toLowerCase()}`;
}

function redactEmailAddresses(value: string): string {
  return value.replace(
    /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi,
    (_match, domain: string) => `***@${domain.toLowerCase()}`,
  );
}

function redactRawBodyLikeFields(value: string): string {
  return value
    .replace(
      /(["']?(?:body|bodyText|bodyHtml|messageBody|rawBody|rawText|contentBytes|attachmentContent|fileContent)["']?\s*[:=]\s*)["']?[^"',}\n]+["']?/gi,
      `$1${REDACTED}`,
    )
    .replace(/(["']?content["']?\s*:\s*["'])[^"']+(["'])/gi, `$1${REDACTED}$2`);
}

export function redactSafeOutputString(value: string): string {
  const redacted = redactEmailAddresses(
    redactRawBodyLikeFields(value)
      .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, REDACTED)
      .replace(/(authorization["':=\s]+bearer\s+)[^"',\s}]+/gi, `$1${REDACTED}`)
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
      .replace(/(authorization["':=\s]+)[^"',\s}]+/gi, `$1${REDACTED}`)
      .replace(/(x-internal-api-key["':=\s]+)[^"',\s}]+/gi, `$1${REDACTED}`)
      .replace(/(api[_-]?key["':=\s]+)[^"',\s}]+/gi, `$1${REDACTED}`)
      .replace(/(refresh[_-]?token["':=\s]+)[^"',\s}]+/gi, `$1${REDACTED}`)
      .replace(/(access[_-]?token["':=\s]+)[^"',\s}]+/gi, `$1${REDACTED}`)
      .replace(/(token["':=\s]+)[^"',\s}]+/gi, `$1${REDACTED}`)
      .replace(/(password["':=\s]+)[^"',\s}]+/gi, `$1${REDACTED}`)
      .replace(/(secret["':=\s]+)[^"',\s}]+/gi, `$1${REDACTED}`)
      .replace(/(client[_-]?secret["':=\s]+)[^"',\s}]+/gi, `$1${REDACTED}`)
      .replace(/sk-[A-Za-z0-9_-]+/g, REDACTED)
      .replace(/bot[A-Za-z0-9:_-]{20,}/g, 'bot[redacted]'),
  );

  if (redacted.length <= MAX_SAFE_STRING_LENGTH) {
    return redacted;
  }

  return `${redacted.slice(0, MAX_SAFE_STRING_LENGTH)}...[truncated]`;
}

export function sanitizeSafeOutputValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_SAFE_DEPTH) {
    return '[max-depth]';
  }

  if (typeof value === 'string') {
    return redactSafeOutputString(value);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSafeOutputString(value.message),
      stack: value.stack ? redactSafeOutputString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSafeOutputValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        isSensitiveOutputKey(key)
          ? REDACTED
          : sanitizeSafeOutputValue(entry, depth + 1),
      ]),
    );
  }

  return redactSafeOutputString(String(value));
}

export function sanitizeSafeOutputRecord(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeSafeOutputValue(meta) as Record<string, unknown>;
}

export function sanitizeSafeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (
    redactSafeOutputString(message).trim().slice(0, 500) || 'Unknown error.'
  );
}
