import {
  redactSafeOutputString,
  sanitizeSafeOutputRecord,
  sanitizeSafeOutputValue,
} from '../safety/redaction';

type LogLevel = 'info' | 'warn' | 'error';

export function redactLogString(value: string): string {
  return redactSafeOutputString(value);
}

export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  return sanitizeSafeOutputValue(value, depth);
}

export function sanitizeLogMeta(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeSafeOutputRecord(meta);
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
