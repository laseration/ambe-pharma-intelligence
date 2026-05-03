import type { RegulatoryEventType, RegulatorySeverity } from '@prisma/client';

export const REGULATORY_PARSER_VERSION = 'mhra-deterministic-v1';

export type RegulatoryParseInput = {
  title: string;
  rawText: string;
  category?: string | null;
  regulator?: string | null;
};

export type RegulatoryParsedSignal = {
  eventType: RegulatoryEventType;
  severity: RegulatorySeverity;
  summary: string;
  affectedProductText: string | null;
  activeSubstance: string | null;
  manufacturer: string | null;
  licenceNumber: string | null;
  batchNumber: string | null;
  confidence: number;
  evidence: {
    parserVersion: string;
    matchedTerms: string[];
    evidenceSnippets: string[];
    safetyWording: string;
  };
};

const EVENT_RULES: Array<{
  eventType: RegulatoryEventType;
  terms: string[];
}> = [
  {
    eventType: 'RECALL',
    terms: ['recall', 'drug alert', 'class 1 medicines recall', 'class 2 medicines recall', 'class 3 medicines recall'],
  },
  {
    eventType: 'MEDICINE_DEFECT',
    terms: ['medicine defect', 'defective medicine', 'company led medicines recall', 'defect'],
  },
  {
    eventType: 'SAFETY_ALERT',
    terms: ['safety alert', 'patient safety', 'serious safety concern', 'risk of'],
  },
  {
    eventType: 'LICENCE_CHANGE',
    terms: ['licence change', 'license change', 'marketing authorisation', 'marketing authorization', 'suspended licence', 'licence suspended'],
  },
  {
    eventType: 'PRODUCT_WITHDRAWAL',
    terms: ['product withdrawal', 'withdrawn from the market', 'withdrawal'],
  },
  {
    eventType: 'SUPPLY_DISRUPTION',
    terms: ['supply disruption', 'supply issue', 'shortage', 'limited supply'],
  },
];

const CRITICAL_TERMS = ['class 1', 'serious risk', 'life-threatening', 'immediate action', 'stop supplying'];
const HIGH_TERMS = ['class 2', 'recall', 'medicine defect', 'safety alert', 'quarantine'];
const LOW_TERMS = ['class 4', 'caution in use', 'information only'];

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function collectMatchedTerms(normalizedText: string, terms: string[]): string[] {
  return terms.filter((term) => normalizedText.includes(term));
}

function detectEventType(text: string): { eventType: RegulatoryEventType; matchedTerms: string[] } {
  for (const rule of EVENT_RULES) {
    const matchedTerms = collectMatchedTerms(text, rule.terms);
    if (matchedTerms.length > 0) {
      return {
        eventType: rule.eventType,
        matchedTerms,
      };
    }
  }

  return {
    eventType: 'OTHER_REGULATORY_UPDATE',
    matchedTerms: [],
  };
}

function detectSeverity(text: string, eventType: RegulatoryEventType): RegulatorySeverity {
  if (collectMatchedTerms(text, CRITICAL_TERMS).length > 0) {
    return 'CRITICAL';
  }

  if (collectMatchedTerms(text, HIGH_TERMS).length > 0) {
    return 'HIGH';
  }

  if (collectMatchedTerms(text, LOW_TERMS).length > 0) {
    return 'LOW';
  }

  if (eventType === 'OTHER_REGULATORY_UPDATE' || eventType === 'LICENCE_CHANGE') {
    return 'MEDIUM';
  }

  return 'MEDIUM';
}

function findLabeledValue(lines: string[], labels: string[]): string | null {
  for (const line of lines) {
    for (const label of labels) {
      const pattern = new RegExp(`^${label}\\s*[:\\-]\\s*(.+)$`, 'i');
      const match = line.match(pattern);
      if (match?.[1]?.trim()) {
        return match[1].trim();
      }
    }
  }

  return null;
}

function cleanProductCandidate(value: string): string {
  return value
    .replace(/\b(class|type)\s+\d+\b/gi, ' ')
    .replace(/\b(medicines?|medical device|recall|notification|alert|drug alert)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-:]+|[-:]+$/g, '')
    .trim();
}

function inferProductFromTitle(title: string): string | null {
  const withoutPrefix = title
    .replace(/^mhra\s+/i, '')
    .replace(/^(drug alert|medicine recall|medicines recall|safety alert)\s*[:-]\s*/i, '')
    .trim();
  const candidate = cleanProductCandidate(withoutPrefix.split(/(?::|\s-\s)/)[0] ?? withoutPrefix);

  if (candidate.length < 3 || /^(mhra|gov\.uk)$/i.test(candidate)) {
    return null;
  }

  return candidate;
}

function collectEvidenceSnippets(lines: string[], matchedTerms: string[]): string[] {
  const snippets = lines.filter((line) => {
    const normalizedLine = normalize(line);
    return matchedTerms.some((term) => normalizedLine.includes(term));
  });

  return Array.from(new Set(snippets)).slice(0, 5);
}

function buildSummary(input: {
  title: string;
  eventType: RegulatoryEventType;
  severity: RegulatorySeverity;
  affectedProductText: string | null;
}): string {
  const productText = input.affectedProductText
    ? ` Possible affected product: ${input.affectedProductText}.`
    : ' Possible affected product needs review.';

  return `Potentially relevant update: ${input.title}. Event type: ${input.eventType.replace(/_/g, ' ')}. Severity: ${input.severity}.${productText}`;
}

function scoreConfidence(input: {
  eventType: RegulatoryEventType;
  affectedProductText: string | null;
  matchedTerms: string[];
  evidenceSnippets: string[];
}): number {
  let score = 40;

  if (input.eventType !== 'OTHER_REGULATORY_UPDATE') {
    score += 20;
  }

  if (input.affectedProductText) {
    score += 20;
  }

  score += Math.min(input.matchedTerms.length * 5, 10);
  score += Math.min(input.evidenceSnippets.length * 3, 10);

  return Math.min(score, 95);
}

export function parseRegulatoryUpdate(input: RegulatoryParseInput): RegulatoryParsedSignal {
  const lines = splitLines(`${input.title}\n${input.category ?? ''}\n${input.rawText}`);
  const normalizedText = normalize(lines.join('\n'));
  const eventDetection = detectEventType(normalizedText);
  const severity = detectSeverity(normalizedText, eventDetection.eventType);
  const affectedProductText =
    findLabeledValue(lines, ['product', 'product name', 'medicine', 'affected product', 'name']) ??
    inferProductFromTitle(input.title);
  const activeSubstance = findLabeledValue(lines, ['active substance', 'substance', 'generic name']);
  const manufacturer = findLabeledValue(lines, ['manufacturer', 'company', 'marketing authorisation holder']);
  const licenceNumber = findLabeledValue(lines, ['pl number', 'licence number', 'license number', 'marketing authorisation']);
  const batchNumber = findLabeledValue(lines, ['batch', 'batch number', 'lot']);
  const evidenceSnippets = collectEvidenceSnippets(lines, eventDetection.matchedTerms);
  const confidence = scoreConfidence({
    eventType: eventDetection.eventType,
    affectedProductText,
    matchedTerms: eventDetection.matchedTerms,
    evidenceSnippets,
  });

  return {
    eventType: eventDetection.eventType,
    severity,
    summary: buildSummary({
      title: input.title,
      eventType: eventDetection.eventType,
      severity,
      affectedProductText,
    }),
    affectedProductText,
    activeSubstance,
    manufacturer,
    licenceNumber,
    batchNumber,
    confidence,
    evidence: {
      parserVersion: REGULATORY_PARSER_VERSION,
      matchedTerms: eventDetection.matchedTerms,
      evidenceSnippets,
      safetyWording: 'Requires compliance review. This system does not claim legal certainty.',
    },
  };
}
