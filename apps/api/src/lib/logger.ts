type LogLevel = 'info' | 'warn' | 'error';

const REDACTED = '[redacted]';
const MAX_LOG_STRING_LENGTH = 1200;
const MAX_LOG_DEPTH = 6;

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

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function redactLogString(value: string): string {
  const redacted = value
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, REDACTED)
    .replace(/(authorization["':=\s]+bearer\s+)[^"',\s]+/gi, `$1${REDACTED}`)
    .replace(/(x-internal-api-key["':=\s]+)[^"',\s]+/gi, `$1${REDACTED}`)
    .replace(/(api[_-]?key["':=\s]+)[^"',\s]+/gi, `$1${REDACTED}`)
    .replace(/(token["':=\s]+)[^"',\s]+/gi, `$1${REDACTED}`)
    .replace(/(password["':=\s]+)[^"',\s]+/gi, `$1${REDACTED}`)
    .replace(/(secret["':=\s]+)[^"',\s]+/gi, `$1${REDACTED}`)
    .replace(/sk-[A-Za-z0-9_-]+/g, REDACTED);

  if (redacted.length <= MAX_LOG_STRING_LENGTH) {
    return redacted;
  }

  return `${redacted.slice(0, MAX_LOG_STRING_LENGTH)}...[truncated]`;
}

export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_LOG_DEPTH) {
    return '[max-depth]';
  }

  if (typeof value === 'string') {
    return redactLogString(value);
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
      message: redactLogString(value.message),
      stack: value.stack ? redactLogString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        isSensitiveKey(key) ? REDACTED : sanitizeLogValue(entry, depth + 1),
      ]),
    );
  }

  return redactLogString(String(value));
}

export function sanitizeLogMeta(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeLogValue(meta) as Record<string, unknown>;
}

function write(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message: redactLogString(message),
    ...(meta ? { meta: sanitizeLogMeta(meta) } : {}),
  };

  console[level === 'info' ? 'log' : level](JSON.stringify(payload));
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) =>
    write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) =>
    write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) =>
    write('error', message, meta),
};
