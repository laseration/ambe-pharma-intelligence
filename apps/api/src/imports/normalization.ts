import type { ProductCandidates } from './types';

const TOKEN_REPLACEMENTS: Record<string, string> = {
  tabs: 'tablet',
  tab: 'tablet',
  tablets: 'tablet',
  caps: 'capsule',
  cap: 'capsule',
  capsules: 'capsule',
  caplets: 'caplet',
  soln: 'solution',
  solns: 'solution',
  susp: 'suspension',
  inj: 'injection',
  injections: 'injection',
  liq: 'liquid',
  liquids: 'liquid',
  crm: 'cream',
  creams: 'cream',
  oint: 'ointment',
  ointments: 'ointment',
  drop: 'drops',
  vials: 'vial',
  amp: 'ampoule',
  amps: 'ampoule',
  ampoules: 'ampoule',
  sachets: 'sachet',
  pcs: 'unit',
  pc: 'unit',
};

const FORMULATION_TOKENS = new Set([
  'tablet',
  'capsule',
  'caplet',
  'liquid',
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
  'sachet',
]);

const NOISE_TOKENS = new Set(['x', 'pack', 'of']);
const SLASH_PLACEHOLDER = 'zzslashzz';
const COMPOUND_STRENGTH_PATTERN =
  /\b\d+(?:\.\d+)?\s?(?:mg|mcg|μg|ug|g|kg|iu)\s*\/\s*(?:\d+(?:\.\d+)?\s*)?(?:ml|l)\b/i;
const COMPOUND_STRENGTH_PATTERN_GLOBAL =
  /\b\d+(?:\.\d+)?\s?(?:mg|mcg|μg|ug|g|kg|iu)\s*\/\s*(?:\d+(?:\.\d+)?\s*)?(?:ml|l)\b/gi;
const COMPOUND_STRENGTH_TOKEN_PATTERN =
  /^\d+(?:\.\d+)?(?:mg|mcg|μg|ug|g|kg|iu)\/(?:\d+(?:\.\d+)?)?(?:ml|l)$/i;

function cleanWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function canonicalizeStrength(value: string): string {
  return value
    .toLowerCase()
    .replace(/μg/g, 'mcg')
    .replace(/\bug\b/g, 'mcg')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, '');
}

function canonicalizePackSize(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/\b(\d+)s\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  const match = cleaned.match(/(\d+)\s*x\s*(\d+)/);

  if (match) {
    return `${match[1]}x${match[2]}`;
  }

  const prefixedMatch = cleaned.match(/\bx\s*(\d+)\b/);

  if (prefixedMatch) {
    return prefixedMatch[1] ?? cleaned;
  }

  const firstNumber = cleaned.match(/\d+/);

  return firstNumber ? firstNumber[0] : cleaned;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\boral\s+susp(?:ension)?\b/gi, 'suspension')
    .replace(/\boral\s+sol(?:ution|n)?\b/gi, 'solution')
    .replace(/\boral\s+liquid\b/gi, 'liquid')
    .replace(COMPOUND_STRENGTH_PATTERN_GLOBAL, (match) =>
      canonicalizeStrength(match).replace(/\//g, SLASH_PLACEHOLDER),
    )
    .replace(/[()[\],]/g, ' ')
    .replace(/\b(\d+)\s*[x×]\s*(\d+)\b/gi, '$1 x $2')
    .replace(/\bx(?=\d+\b)/gi, 'x ')
    .replace(/\b(\d+)s\b/gi, '$1')
    .replace(/[/_-]/g, ' ')
    .replace(/\b(\d+)(mg|mcg|μg|ug|g|kg|ml|l|iu)\b/gi, '$1 $2')
    .split(/\s+/)
    .map((token) =>
      token
        .trim()
        .replace(/^[^a-z0-9_]+|[^a-z0-9_]+$/g, '')
        .replace(new RegExp(SLASH_PLACEHOLDER, 'g'), '/'),
    )
    .filter(Boolean)
    .map((token) => TOKEN_REPLACEMENTS[token] ?? token);
}

function extractStrength(cleaned: string): string | null {
  const compoundMatch = cleaned.match(COMPOUND_STRENGTH_PATTERN);

  if (compoundMatch?.[0]) {
    return canonicalizeStrength(compoundMatch[0]);
  }

  const match = cleaned.match(
    /\b\d+(?:\.\d+)?\s?(?:mg|mcg|μg|ug|g|kg|ml|l|iu)\b/i,
  );

  return match ? canonicalizeStrength(match[0]) : null;
}

function extractFormulation(tokens: string[]): string | null {
  return tokens.find((token) => FORMULATION_TOKENS.has(token)) ?? null;
}

function extractPackSize(cleaned: string, tokens: string[]): string | null {
  const compoundMatch = cleaned.match(/\b\d+\s*[x×]\s*\d+\b/i);

  if (compoundMatch) {
    return canonicalizePackSize(compoundMatch[0]);
  }

  const formulationIndex = tokens.findIndex((token) =>
    FORMULATION_TOKENS.has(token),
  );

  if (formulationIndex >= 0) {
    for (let index = formulationIndex + 1; index < tokens.length; index += 1) {
      const nextToken = tokens[index];
      const nextNextToken = tokens[index + 1];

      if (!nextToken || NOISE_TOKENS.has(nextToken)) {
        continue;
      }

      if (nextToken === 'x' && nextNextToken && /^\d+$/.test(nextNextToken)) {
        return canonicalizePackSize(nextNextToken);
      }

      if (/^\d+$/.test(nextToken)) {
        return canonicalizePackSize(nextToken);
      }
    }

    for (let index = formulationIndex - 1; index >= 0; index -= 1) {
      const previousToken = tokens[index];
      const nextToken = tokens[index + 1];

      if (!previousToken || NOISE_TOKENS.has(previousToken)) {
        continue;
      }

      if (/^\d+$/.test(previousToken)) {
        if (nextToken && /^(mg|mcg|μg|ug|g|kg|iu)$/i.test(nextToken)) {
          continue;
        }

        return canonicalizePackSize(previousToken);
      }
    }

    return null;
  }

  const trailingToken = [...tokens]
    .reverse()
    .find((token) => /^\d+$/.test(token));

  return trailingToken ? canonicalizePackSize(trailingToken) : null;
}

function isStrengthToken(token: string): boolean {
  return (
    /^\d+(?:\.\d+)?$/.test(token) ||
    /^(mg|mcg|μg|ug|g|kg|ml|l|iu)$/i.test(token) ||
    COMPOUND_STRENGTH_TOKEN_PATTERN.test(token)
  );
}

function buildBaseNameTokens(
  tokens: string[],
  formulation: string | null,
  packSize: string | null,
): string[] {
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

function deriveConfidence(
  baseTokens: string[],
  strength: string | null,
  formulation: string | null,
): 'HIGH' | 'MEDIUM' | 'LOW' {
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

export function buildCanonicalProductIdentity(rawProductName: string) {
  const cleanedInput = cleanWhitespace(rawProductName);
  const normalizedText = normalizeText(cleanedInput);
  const tokens = tokenize(cleanedInput);
  const rulesApplied: string[] = [
    'trimmed surrounding whitespace',
    'collapsed repeated whitespace',
    'lowercased input for canonical processing',
  ];

  if (tokens.some((token) => ['tablet', 'capsule', 'caplet'].includes(token))) {
    rulesApplied.push(
      'mapped common formulation abbreviations to canonical formulation tokens',
    );
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
  const baseName = baseNameTokens.join(' ') || normalizedText;

  rulesApplied.push(
    'built canonical normalized key from base name and extracted attributes',
  );

  return {
    baseName,
    cleanedInput,
    normalizedText,
    tokens,
    rulesApplied,
    strength,
    formulation,
    packSize,
    confidence: deriveConfidence(baseNameTokens, strength, formulation),
  };
}

export function normalizeMedicineName(
  rawProductName: string,
): ProductCandidates {
  const canonicalIdentity = buildCanonicalProductIdentity(rawProductName);
  const normalizedKeyParts = [
    canonicalIdentity.baseName || canonicalIdentity.normalizedText,
    canonicalIdentity.strength,
    canonicalIdentity.formulation,
    canonicalIdentity.packSize,
  ].filter(Boolean);
  const normalizedKey = normalizedKeyParts.join('|');

  // Keep the two meanings explicit:
  // - normalizedName: base-name-style normalized text used for explainable fallback matching
  // - normalizedKey: richer composite key currently persisted into Product.normalizedName
  return {
    baseName: canonicalIdentity.baseName,
    normalizedName:
      canonicalIdentity.baseName || canonicalIdentity.normalizedText,
    strength: canonicalIdentity.strength,
    formulation: canonicalIdentity.formulation,
    packSize: canonicalIdentity.packSize,
    normalizedKey,
    confidence: canonicalIdentity.confidence,
    explanation: {
      cleanedInput: canonicalIdentity.cleanedInput,
      tokens: canonicalIdentity.tokens,
      rulesApplied: canonicalIdentity.rulesApplied,
      extracted: {
        strength: canonicalIdentity.strength,
        formulation: canonicalIdentity.formulation,
        packSize: canonicalIdentity.packSize,
      },
    },
  };
}

export function buildProductCandidates(
  rawProductName: string,
): ProductCandidates {
  return normalizeMedicineName(rawProductName);
}
