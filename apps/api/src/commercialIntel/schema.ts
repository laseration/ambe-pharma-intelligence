export type EmailIntentClassification =
  | 'SUPPLIER_OFFER'
  | 'CUSTOMER_REQUEST'
  | 'COMMERCIAL_INTEL'
  | 'MIXED'
  | 'UNKNOWN';

export type CommercialIntelItemType =
  | 'SUPPLIER_RELIABILITY_NOTE'
  | 'BUYER_DEMAND_SIGNAL'
  | 'MANUAL_BUY_TRIGGER'
  | 'MANUAL_SELL_TRIGGER'
  | 'MARKET_PRICE_INTEL'
  | 'EXPIRY_RISK_RULE'
  | 'PRODUCT_NOTE'
  | 'CONTACT_NOTE'
  | 'OTHER';

export type CommercialIntelConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type AiCommercialIntelItem = {
  itemType: CommercialIntelItemType;
  productText: string | null;
  supplierName: string | null;
  customerName: string | null;
  contactName: string | null;
  priceThreshold: number | null;
  currency: 'GBP' | 'USD' | 'EUR' | null;
  availabilitySignal: string | null;
  riskLevel: string | null;
  urgency: string | null;
  signalEffect: string | null;
  evidenceText: string;
  confidence: CommercialIntelConfidence;
  reviewReason: string | null;
  validUntil: string | null;
};

export type AiCommercialIntelResponse = {
  intent: EmailIntentClassification;
  items: AiCommercialIntelItem[];
  overallConfidence: CommercialIntelConfidence;
  reviewRecommended: boolean;
  notes: string[];
};

export const COMMERCIAL_INTEL_PROMPT_VERSION = 'commercial-intel-v1';

export const COMMERCIAL_INTEL_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: {
      type: 'string',
      enum: ['SUPPLIER_OFFER', 'CUSTOMER_REQUEST', 'COMMERCIAL_INTEL', 'MIXED', 'UNKNOWN'],
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          itemType: {
            type: 'string',
            enum: [
              'SUPPLIER_RELIABILITY_NOTE',
              'BUYER_DEMAND_SIGNAL',
              'MANUAL_BUY_TRIGGER',
              'MANUAL_SELL_TRIGGER',
              'MARKET_PRICE_INTEL',
              'EXPIRY_RISK_RULE',
              'PRODUCT_NOTE',
              'CONTACT_NOTE',
              'OTHER',
            ],
          },
          productText: { type: ['string', 'null'] },
          supplierName: { type: ['string', 'null'] },
          customerName: { type: ['string', 'null'] },
          contactName: { type: ['string', 'null'] },
          priceThreshold: { type: ['number', 'null'] },
          currency: {
            type: ['string', 'null'],
            enum: ['GBP', 'USD', 'EUR', null],
          },
          availabilitySignal: { type: ['string', 'null'] },
          riskLevel: { type: ['string', 'null'] },
          urgency: { type: ['string', 'null'] },
          signalEffect: { type: ['string', 'null'] },
          evidenceText: { type: 'string' },
          confidence: {
            type: 'string',
            enum: ['HIGH', 'MEDIUM', 'LOW'],
          },
          reviewReason: { type: ['string', 'null'] },
          validUntil: { type: ['string', 'null'] },
        },
        required: [
          'itemType',
          'productText',
          'supplierName',
          'customerName',
          'contactName',
          'priceThreshold',
          'currency',
          'availabilitySignal',
          'riskLevel',
          'urgency',
          'signalEffect',
          'evidenceText',
          'confidence',
          'reviewReason',
          'validUntil',
        ],
      },
    },
    overallConfidence: {
      type: 'string',
      enum: ['HIGH', 'MEDIUM', 'LOW'],
    },
    reviewRecommended: { type: 'boolean' },
    notes: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['intent', 'items', 'overallConfidence', 'reviewRecommended', 'notes'],
} as const;

function isIntent(value: unknown): value is EmailIntentClassification {
  return (
    value === 'SUPPLIER_OFFER' ||
    value === 'CUSTOMER_REQUEST' ||
    value === 'COMMERCIAL_INTEL' ||
    value === 'MIXED' ||
    value === 'UNKNOWN'
  );
}

function isItemType(value: unknown): value is CommercialIntelItemType {
  return (
    value === 'SUPPLIER_RELIABILITY_NOTE' ||
    value === 'BUYER_DEMAND_SIGNAL' ||
    value === 'MANUAL_BUY_TRIGGER' ||
    value === 'MANUAL_SELL_TRIGGER' ||
    value === 'MARKET_PRICE_INTEL' ||
    value === 'EXPIRY_RISK_RULE' ||
    value === 'PRODUCT_NOTE' ||
    value === 'CONTACT_NOTE' ||
    value === 'OTHER'
  );
}

function isConfidence(value: unknown): value is CommercialIntelConfidence {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW';
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeCurrency(value: unknown): 'GBP' | 'USD' | 'EUR' | null {
  return value === 'GBP' || value === 'USD' || value === 'EUR' ? value : null;
}

export function validateCommercialIntelResponse(value: unknown): {
  valid: boolean;
  data: AiCommercialIntelResponse | null;
  issues: string[];
} {
  const issues: string[] = [];

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      valid: false,
      data: null,
      issues: ['Commercial intel parser output was not an object.'],
    };
  }

  const candidate = value as Record<string, unknown>;
  const items = Array.isArray(candidate.items) ? candidate.items : null;

  if (!isIntent(candidate.intent)) {
    issues.push('Commercial intel parser output had an invalid intent.');
  }

  if (!items) {
    issues.push('Commercial intel parser output did not include an items array.');
  }

  if (!isConfidence(candidate.overallConfidence)) {
    issues.push('Commercial intel parser output had an invalid overall confidence.');
  }

  if (typeof candidate.reviewRecommended !== 'boolean') {
    issues.push('Commercial intel parser output had an invalid reviewRecommended value.');
  }

  if (!Array.isArray(candidate.notes) || candidate.notes.some((item) => typeof item !== 'string')) {
    issues.push('Commercial intel parser output had invalid notes.');
  }

  const normalizedItems: AiCommercialIntelItem[] = [];

  items?.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      issues.push(`Commercial intel item ${index + 1} was not an object.`);
      return;
    }

    const rawItem = item as Record<string, unknown>;
    const evidenceText = normalizeNullableString(rawItem.evidenceText);
    const itemType = rawItem.itemType;
    const confidence = rawItem.confidence;

    if (!isItemType(itemType)) {
      issues.push(`Commercial intel item ${index + 1} had an invalid itemType.`);
    }

    if (!evidenceText) {
      issues.push(`Commercial intel item ${index + 1} was missing evidenceText.`);
    }

    if (!isConfidence(confidence)) {
      issues.push(`Commercial intel item ${index + 1} had an invalid confidence.`);
    }

    normalizedItems.push({
      itemType: isItemType(itemType) ? itemType : 'OTHER',
      productText: normalizeNullableString(rawItem.productText),
      supplierName: normalizeNullableString(rawItem.supplierName),
      customerName: normalizeNullableString(rawItem.customerName),
      contactName: normalizeNullableString(rawItem.contactName),
      priceThreshold: normalizeNullableNumber(rawItem.priceThreshold),
      currency: normalizeCurrency(rawItem.currency),
      availabilitySignal: normalizeNullableString(rawItem.availabilitySignal),
      riskLevel: normalizeNullableString(rawItem.riskLevel),
      urgency: normalizeNullableString(rawItem.urgency),
      signalEffect: normalizeNullableString(rawItem.signalEffect),
      evidenceText: evidenceText ?? '',
      confidence: isConfidence(confidence) ? confidence : 'LOW',
      reviewReason: normalizeNullableString(rawItem.reviewReason),
      validUntil: normalizeNullableString(rawItem.validUntil),
    });
  });

  const validItems = normalizedItems.filter((item) => item.evidenceText);

  if (issues.length > 0) {
    return {
      valid: false,
      data: null,
      issues,
    };
  }

  return {
    valid: true,
    data: {
      intent: isIntent(candidate.intent) ? candidate.intent : 'UNKNOWN',
      items: validItems,
      overallConfidence: isConfidence(candidate.overallConfidence)
        ? candidate.overallConfidence
        : 'LOW',
      reviewRecommended: candidate.reviewRecommended as boolean,
      notes: (candidate.notes as string[]).map((note) => note.trim()).filter(Boolean),
    },
    issues: [],
  };
}
