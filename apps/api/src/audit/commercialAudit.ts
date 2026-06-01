type AuditEntityType =
  | 'OFFER_WORKFLOW_ITEM'
  | 'BUY_DECISION'
  | 'BUY_EXECUTION'
  | 'TRADE_OPPORTUNITY'
  | 'AUTOMATION_READINESS_POLICY'
  | 'OFFER_CORRECTION';

type AuditStatusTransition = {
  previous?: string | null;
  next?: string | null;
};

type AuditSourceReference = {
  inboundEmailId?: string | null;
  emailDerivedOfferId?: string | null;
  offerWorkflowItemId?: string | null;
  buyDecisionId?: string | null;
  buyExecutionId?: string | null;
  sourceKind?: string | null;
  sourceReviewReason?: string | null;
  sourceDocumentId?: string | null;
  sourceDocumentLabel?: string | null;
};

type AuditConfidence = {
  sourceTrustScore?: number | null;
  structureConfidence?: number | null;
  fieldConfidence?: number | null;
  entityResolutionConfidence?: number | null;
  promotionConfidence?: number | null;
};

export type CommercialAuditMetadataInput = {
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  status?: AuditStatusTransition;
  approvalStatus?: AuditStatusTransition;
  orderStatus?: AuditStatusTransition;
  fulfillmentStatus?: AuditStatusTransition;
  reconciliationStatus?: AuditStatusTransition;
  changedFields?: string[];
  source?: AuditSourceReference;
  confidence?: AuditConfidence;
};

const REDACTED = '[redacted]';
const SENSITIVE_KEY_PATTERN =
  /(secret|password|token|api[-_]?key|authorization|cookie|raw(html|text|body)|bodytext|sourceblocktext|connection|string|url)$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeAuditValue(item),
    ]),
  );
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === null || item === undefined) {
        return false;
      }

      if (Array.isArray(item)) {
        return item.length > 0;
      }

      if (isPlainObject(item)) {
        return Object.keys(item).length > 0;
      }

      return true;
    }),
  ) as T;
}

export function buildCommercialAuditMetadata(
  input: CommercialAuditMetadataInput,
  existingMetadata?: unknown,
): Record<string, unknown> {
  const baseMetadata = isPlainObject(existingMetadata)
    ? (sanitizeAuditValue(existingMetadata) as Record<string, unknown>)
    : existingMetadata === undefined || existingMetadata === null
      ? {}
      : { detail: sanitizeAuditValue(existingMetadata) };

  const commercialAudit = compactObject({
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    status: input.status ? compactObject(input.status) : undefined,
    approvalStatus: input.approvalStatus
      ? compactObject(input.approvalStatus)
      : undefined,
    orderStatus: input.orderStatus
      ? compactObject(input.orderStatus)
      : undefined,
    fulfillmentStatus: input.fulfillmentStatus
      ? compactObject(input.fulfillmentStatus)
      : undefined,
    reconciliationStatus: input.reconciliationStatus
      ? compactObject(input.reconciliationStatus)
      : undefined,
    changedFields: input.changedFields,
    source: input.source ? compactObject(input.source) : undefined,
    confidence: input.confidence ? compactObject(input.confidence) : undefined,
  });

  return {
    ...baseMetadata,
    commercialAudit,
  };
}
