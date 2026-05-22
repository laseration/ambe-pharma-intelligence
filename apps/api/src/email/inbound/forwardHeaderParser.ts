import type { Rfc5322Header } from './types';
import { extractEmailAddresses, normaliseHeaderName } from './signalExtractors';

export type ParsedForwardHeader = {
  source: 'RFC5322_HEADER' | 'BODY';
  name: string;
  value: string;
  emails: string[];
};

const FORWARDED_HEADER_PATTERN =
  /^\s*(from|sender|reply-to|resent-from|to|cc|subject|date|sent)\s*:\s*(.+?)\s*$/gim;

export function parseForwardedHeaderBlocks(
  bodyText: string | null | undefined,
): ParsedForwardHeader[] {
  const value = bodyText ?? '';
  const headers: ParsedForwardHeader[] = [];

  for (const match of value.matchAll(FORWARDED_HEADER_PATTERN)) {
    const name = normaliseHeaderName(match[1] ?? '');
    const headerValue = (match[2] ?? '').trim();

    if (!name || !headerValue) {
      continue;
    }

    headers.push({
      source: 'BODY',
      name,
      value: headerValue,
      emails: extractEmailAddresses(headerValue),
    });
  }

  return headers;
}

export function normaliseInternetMessageHeaders(
  headers: Rfc5322Header[] | null | undefined,
): ParsedForwardHeader[] {
  return (headers ?? [])
    .map((header) => ({
      source: 'RFC5322_HEADER' as const,
      name: normaliseHeaderName(header.name),
      value: header.value.trim(),
      emails: extractEmailAddresses(header.value),
    }))
    .filter((header) => header.name && header.value);
}

export function findHeaderEmail(
  headers: ParsedForwardHeader[],
  names: string[],
): string | null {
  const wanted = new Set(names.map(normaliseHeaderName));
  for (const header of headers) {
    if (!wanted.has(header.name)) {
      continue;
    }

    const email = header.emails[0];
    if (email) {
      return email;
    }
  }

  return null;
}
