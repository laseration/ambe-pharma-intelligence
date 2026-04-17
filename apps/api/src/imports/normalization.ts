import type { ProductCandidates } from './types';

const TOKEN_REPLACEMENTS: Record<string, string> = {
  tabs: 'tablet',
  tab: 'tablet',
  tablets: 'tablet',
  caps: 'capsule',
  cap: 'capsule',
  capsules: 'capsule',
  caplets: 'caplet',
  pcs: 'unit',
  pc: 'unit',
};

const FORMULATION_TOKENS = new Set([
  'tablet',
  'capsule',
  'caplet',
  'syrup',
  'suspension',
  'solution',
  'injection',
  'cream',
  'ointment',
  'gel',
  'drops',
  'powder',
  'vial',
  'ampoule',
]);

const NOISE_TOKENS = new Set(['x', 'pack', 'of']);

function cleanWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function canonicalizeStrength(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function canonicalizePackSize(value: string): string {
  const cleaned = value.toLowerCase().replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/(\d+)\s*x\s*(\d+)/);

  if (match) {
    return `${match[1]}x${match[2]}`;
  }

  const firstNumber = cleaned.match(/\d+/);

  return firstNumber ? firstNumber[0] : cleaned;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[(),]/g, ' ')
    .replace(/[/_-]/g, ' ')
    .replace(/\b(\d+)(mg|mcg|g|kg|ml|iu)\b/gi, '$1 $2')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => TOKEN_REPLACEMENTS[token] ?? token);
}

function extractStrength(cleaned: string): string | null {
  const match = cleaned.match(/\b\d+(?:\.\d+)?\s?(?:mg|mcg|g|kg|ml|iu)\b/i);

  return match ? canonicalizeStrength(match[0]) : null;
}

function extractFormulation(tokens: string[]): string | null {
  return tokens.find((token) => FORMULATION_TOKENS.has(token)) ?? null;
}

function extractPackSize(cleaned: string, tokens: string[]): string | null {
  const compoundMatch = cleaned.match(/\b\d+\s*x\s*\d+\b/i);

  if (compoundMatch) {
    return canonicalizePackSize(compoundMatch[0]);
  }

  const formulationIndex = tokens.findIndex((token) => FORMULATION_TOKENS.has(token));

  if (formulationIndex >= 0) {
    const nextToken = tokens[formulationIndex + 1];

    if (nextToken && /^\d+$/.test(nextToken)) {
      return canonicalizePackSize(nextToken);
    }
  }

  const trailingToken = [...tokens].reverse().find((token) => /^\d+$/.test(token));

  return trailingToken ? canonicalizePackSize(trailingToken) : null;
}

function isStrengthToken(token: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(token) || /^(mg|mcg|g|kg|ml|iu)$/i.test(token);
}

function buildBaseNameTokens(tokens: string[], formulation: string | null, packSize: string | null): string[] {
  const packTokens = packSize ? packSize.split('x') : [];

  return tokens.filter((token) => {
    if (NOISE_TOKENS.has(token)) {
      return false;
    }

    if (token === formulation) {
      return false;
    }

    if (packTokens.includes(token)) {
      return false;
    }

    if (isStrengthToken(token)) {
      return false;
    }

    return !/^\d+$/.test(token);
  });
}

function deriveConfidence(baseTokens: string[], strength: string | null, formulation: string | null): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (baseTokens.length > 0 && strength && formulation) {
    return 'HIGH';
  }

  if (baseTokens.length > 0 && (strength || formulation)) {
    return 'MEDIUM';
  }

  return 'LOW';
}

export function normalizeText(value: string): string {
  return cleanWhitespace(value).toLowerCase();
}

export function normalizeMedicineName(rawProductName: string): ProductCandidates {
  const cleanedInput = cleanWhitespace(rawProductName);
  const normalizedText = normalizeText(cleanedInput);
  const tokens = tokenize(cleanedInput);
  const rulesApplied: string[] = [
    'trimmed surrounding whitespace',
    'collapsed repeated whitespace',
    'lowercased input for canonical processing',
  ];

  if (tokens.some((token) => ['tablet', 'capsule', 'caplet'].includes(token))) {
    rulesApplied.push('mapped common formulation abbreviations to canonical formulation tokens');
  }

  const strength = extractStrength(cleanedInput);
  if (strength) {
    rulesApplied.push('extracted normalized strength token');
  }

  const formulation = extractFormulation(tokens);
  if (formulation) {
    rulesApplied.push('extracted formulation token');
  }

  const packSize = extractPackSize(cleanedInput, tokens);
  if (packSize) {
    rulesApplied.push('extracted pack size token');
  }

  const baseNameTokens = buildBaseNameTokens(tokens, formulation, packSize);
  const baseName = baseNameTokens.join(' ');
  const normalizedKeyParts = [baseName || normalizedText, strength, formulation, packSize].filter(Boolean);
  const normalizedKey = normalizedKeyParts.join('|');
  const confidence = deriveConfidence(baseNameTokens, strength, formulation);

  rulesApplied.push('built canonical normalized key from base name and extracted attributes');

  return {
    normalizedName: baseName || normalizedText,
    strength,
    formulation,
    packSize,
    normalizedKey,
    confidence,
    explanation: {
      cleanedInput,
      tokens,
      rulesApplied,
      extracted: {
        strength,
        formulation,
        packSize,
      },
    },
  };
}

export function buildProductCandidates(rawProductName: string): ProductCandidates {
  return normalizeMedicineName(rawProductName);
}
