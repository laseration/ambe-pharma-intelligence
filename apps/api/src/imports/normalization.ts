import type { ProductCandidates } from './types';

function cleanWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeText(value: string): string {
  return cleanWhitespace(value).toLowerCase();
}

function matchFirst(value: string, pattern: RegExp): string | null {
  const match = value.match(pattern);

  return match ? cleanWhitespace(match[0]) : null;
}

export function buildProductCandidates(rawProductName: string): ProductCandidates {
  const cleaned = cleanWhitespace(rawProductName);

  return {
    normalizedName: normalizeText(cleaned),
    strength: matchFirst(cleaned, /\b\d+(?:\.\d+)?\s?(?:mg|mcg|g|kg|ml|iu)\b/i),
    formulation: matchFirst(
      cleaned,
      /\b(?:tablet(?:s)?|capsule(?:s)?|syrup|suspension|solution|injection|cream|ointment|gel|drops|powder|vial(?:s)?|ampoule(?:s)?)\b/i,
    ),
    packSize: matchFirst(
      cleaned,
      /\b(?:\d+\s?(?:tablet(?:s)?|capsule(?:s)?|vial(?:s)?|ampoule(?:s)?|ml|g)|\d+\s?x\s?\d+\b)\b/i,
    ),
  };
}
