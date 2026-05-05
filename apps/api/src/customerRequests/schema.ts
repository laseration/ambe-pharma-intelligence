export type CustomerRequestIntent =
  | 'SUPPLIER_OFFER'
  | 'CUSTOMER_REQUEST'
  | 'COMMERCIAL_INTEL'
  | 'MIXED'
  | 'UNKNOWN';

export type CustomerDemandRequestType =
  | 'SOURCE_PRODUCT'
  | 'CHECK_AVAILABILITY'
  | 'REQUEST_QUOTE'
  | 'BUYER_INTEREST'
  | 'REPEAT_DEMAND'
  | 'OTHER';

export type CustomerDemandConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type AiCustomerDemandItem = {
  requestType: CustomerDemandRequestType;
  customerName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  productText: string | null;
  quantityRequested: number | null;
  targetPrice: number | null;
  currency: 'GBP' | 'USD' | 'EUR' | null;
  neededByDate: string | null;
  urgency: string | null;
  evidenceText: string;
  confidence: CustomerDemandConfidence;
  reviewReason: string | null;
  validUntil: string | null;
};

export type AiCustomerDemandResponse = {
  intent: CustomerRequestIntent;
  items: AiCustomerDemandItem[];
  overallConfidence: CustomerDemandConfidence;
  reviewRecommended: boolean;
  notes: string[];
};

export const CUSTOMER_REQUEST_PROMPT_VERSION = 'customer-request-v1';

export const CUSTOMER_REQUEST_RESPONSE_SCHEMA = {
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
          requestType: {
            type: 'string',
            enum: [
              'SOURCE_PRODUCT',
              'CHECK_AVAILABILITY',
              'REQUEST_QUOTE',
              'BUYER_INTEREST',
              'REPEAT_DEMAND',
              'OTHER',
            ],
          },
          customerName: { type: ['string', 'null'] },
          contactName: { type: ['string', 'null'] },
          contactEmail: { type: ['string', 'null'] },
          productText: { type: ['string', 'null'] },
          quantityRequested: { type: ['number', 'null'] },
          targetPrice: { type: ['number', 'null'] },
          currency: {
            type: ['string', 'null'],
            enum: ['GBP', 'USD', 'EUR', null],
          },
          neededByDate: { type: ['string', 'null'] },
          urgency: { type: ['string', 'null'] },
          evidenceText: { type: 'string' },
          confidence: {
            type: 'string',
            enum: ['HIGH', 'MEDIUM', 'LOW'],
          },
          reviewReason: { type: ['string', 'null'] },
          validUntil: { type: ['string', 'null'] },
        },
        required: [
          'requestType',
          'customerName',
          'contactName',
          'contactEmail',
          'productText',
          'quantityRequested',
          'targetPrice',
          'currency',
          'neededByDate',
          'urgency',
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

function isIntent(value: unknown): value is CustomerRequestIntent {
  return (
    value === 'SUPPLIER_OFFER' ||
    value === 'CUSTOMER_REQUEST' ||
    value === 'COMMERCIAL_INTEL' ||
    value === 'MIXED' ||
    value === 'UNKNOWN'
  );
}

function isRequestType(value: unknown): value is CustomerDemandRequestType {
  return (
    value === 'SOURCE_PRODUCT' ||
    value === 'CHECK_AVAILABILITY' ||
    value === 'REQUEST_QUOTE' ||
    value === 'BUYER_INTEREST' ||
    value === 'REPEAT_DEMAND' ||
    value === 'OTHER'
  );
}

function isConfidence(value: unknown): value is CustomerDemandConfidence {
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

function normalizeNullableInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

function normalizeCurrency(value: unknown): 'GBP' | 'USD' | 'EUR' | null {
  return value === 'GBP' || value === 'USD' || value === 'EUR' ? value : null;
}

export function validateCustomerDemandResponse(value: unknown): {
  valid: boolean;
  data: AiCustomerDemandResponse | null;
  issues: string[];
} {
  const issues: string[] = [];

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      valid: false,
      data: null,
      issues: ['Customer request parser output was not an object.'],
    };
  }

  const candidate = value as Record<string, unknown>;
  const items = Array.isArray(candidate.items) ? candidate.items : null;

  if (!isIntent(candidate.intent)) {
    issues.push('Customer request parser output had an invalid intent.');
  }

  if (!items) {
    issues.push('Customer request parser output did not include an items array.');
  }

  if (!isConfidence(candidate.overallConfidence)) {
    issues.push('Customer request parser output had an invalid overall confidence.');
  }

  if (typeof candidate.reviewRecommended !== 'boolean') {
    issues.push('Customer request parser output had an invalid reviewRecommended value.');
  }

  if (!Array.isArray(candidate.notes) || candidate.notes.some((item) => typeof item !== 'string')) {
    issues.push('Customer request parser output had invalid notes.');
  }

  const normalizedItems: AiCustomerDemandItem[] = [];

  items?.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      issues.push(`Customer request item ${index + 1} was not an object.`);
      return;
    }

    const rawItem = item as Record<string, unknown>;
    const evidenceText = normalizeNullableString(rawItem.evidenceText);
    const requestType = rawItem.requestType;
    const confidence = rawItem.confidence;

    if (!isRequestType(requestType)) {
      issues.push(`Customer request item ${index + 1} had an invalid requestType.`);
    }

    if (!evidenceText) {
      issues.push(`Customer request item ${index + 1} was missing evidenceText.`);
    }

    if (!isConfidence(confidence)) {
      issues.push(`Customer request item ${index + 1} had an invalid confidence.`);
    }

    normalizedItems.push({
      requestType: isRequestType(requestType) ? requestType : 'OTHER',
      customerName: normalizeNullableString(rawItem.customerName),
      contactName: normalizeNullableString(rawItem.contactName),
      contactEmail: normalizeNullableString(rawItem.contactEmail),
      productText: normalizeNullableString(rawItem.productText),
      quantityRequested: normalizeNullableInteger(rawItem.quantityRequested),
      targetPrice: normalizeNullableNumber(rawItem.targetPrice),
      currency: normalizeCurrency(rawItem.currency),
      neededByDate: normalizeNullableString(rawItem.neededByDate),
      urgency: normalizeNullableString(rawItem.urgency),
      evidenceText: evidenceText ?? '',
      confidence: isConfidence(confidence) ? confidence : 'LOW',
      reviewReason: normalizeNullableString(rawItem.reviewReason),
      validUntil: normalizeNullableString(rawItem.validUntil),
    });
  });

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
      items: normalizedItems.filter((item) => item.evidenceText),
      overallConfidence: isConfidence(candidate.overallConfidence) ? candidate.overallConfidence : 'LOW',
      reviewRecommended: candidate.reviewRecommended as boolean,
      notes: (candidate.notes as string[]).map((note) => note.trim()).filter(Boolean),
    },
    issues: [],
  };
}
