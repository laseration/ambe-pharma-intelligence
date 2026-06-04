import { createServer, type ServerResponse } from 'node:http';
import { URL } from 'node:url';

const generatedAt = '2026-06-03T12:00:00.000Z';
const inboundEmailId = 'inbound-email-1';
const workflowItemId = 'workflow-1';

const workflowListItem = {
  id: workflowItemId,
  status: 'NEW',
  priority: 'HIGH',
  priorityReason: 'promotion_threshold_not_met',
  assigneeLabel: null,
  sourceKind: 'STRICT_ATTACHMENT_TABLE',
  sourceReviewReason: 'promotion_threshold_not_met',
  aiAssisted: false,
  latestNote: 'Needs operator review before execution.',
  hasUnresolvedSupplier: false,
  hasConflictingSupplierCues: false,
  hasManufacturerAmbiguity: false,
  supplierQualificationStatus: 'UNKNOWN',
  hasUnknownSupplierQualification: true,
  hasRestrictedSupplier: false,
  hasBlockedSupplier: false,
  qualificationRiskNote: null,
  updatedAt: generatedAt,
  inboundEmailId,
  inboundEmail: {
    id: inboundEmailId,
    fromEmail: 'Pilot Supplier <pilot.supplier@example.test>',
    subject: 'Pilot sanitized supplier offer',
    receivedAt: '2026-06-03T11:55:00.000Z',
  },
  emailDerivedOffer: {
    rawProductText: 'Amlodipine 5mg tablets 28',
    normalizedProductNameCandidate: 'amlodipine|5mg|tablet|28',
    strengthCandidate: '5mg',
    dosageFormCandidate: 'tablet',
    packSizeCandidate: '28',
    supplierCandidate: 'Pilot Supplier Ltd',
    manufacturerCandidate: 'Example Labs',
    priceCandidate: '8.40',
    currencyCandidate: 'GBP',
    availabilityCandidate: 'In stock',
    minimumOrderQuantityCandidate: 10,
  },
};

const appliedCorrection = {
  id: 'correction-1',
  correctionStatus: 'APPLIED',
  correctedSupplierId: null,
  correctedSupplierName: 'Pilot Supplier Ltd',
  correctedProductId: null,
  correctedRawProductText: 'CORRECTED_RAW_TEXT_SHOULD_NOT_RENDER',
  correctedNormalizedProductName: null,
  correctedStrength: null,
  correctedDosageForm: null,
  correctedPackSize: null,
  correctedManufacturer: null,
  correctedUnitPrice: '8.30',
  correctedCurrencyCode: 'GBP',
  correctedMinimumOrderQuantity: null,
  correctedAvailability: null,
  actorType: 'OPERATOR',
  actorIdentifier: 'pilot-operator',
  note: 'CORRECTION_NOTE_SHOULD_NOT_RENDER',
  createdAt: '2026-06-03T11:58:00.000Z',
  updatedAt: '2026-06-03T11:58:00.000Z',
};

const workflowDetail = {
  ...workflowListItem,
  emailDerivedOffer: {
    id: 'offer-1',
    status: 'REVIEW_REQUIRED',
    reviewReason: 'promotion_threshold_not_met',
    sourceKind: 'STRICT_ATTACHMENT_TABLE',
    sourceBlockText:
      'RAW_SOURCE_BODY_SHOULD_NOT_RENDER postgresql://pilot:secret@example.invalid/db Bearer graph-token GRAPH_PAYLOAD_SHOULD_NOT_RENDER TELEGRAM_PAYLOAD_SHOULD_NOT_RENDER',
    rawProductText: 'Amlodipine 5mg tablets 28',
    normalizedProductNameCandidate: 'amlodipine|5mg|tablet|28',
    strengthCandidate: '5mg',
    dosageFormCandidate: 'tablet',
    packSizeCandidate: '28',
    manufacturerCandidate: 'Example Labs',
    supplierCandidate: 'Pilot Supplier Ltd',
    priceCandidate: '8.40',
    currencyCandidate: 'GBP',
    minimumOrderQuantityCandidate: 10,
    availabilityCandidate: 'In stock',
    sourceTrustScore: 80,
    structureConfidence: 82,
    fieldConfidence: 79,
    entityResolutionConfidence: 70,
    promotionConfidence: 72,
    metadata: {
      sourceDocumentKind: 'ATTACHMENT_TABLE',
      sourceDocumentLabel: 'pilot-price-list.xlsx',
      subject: 'Pilot sanitized supplier offer',
    },
    resolutionCandidates: [
      {
        entityType: 'SUPPLIER',
        candidateId: 'supplier-1',
        candidateName: 'Pilot Supplier Ltd',
        confidence: 70,
        reason: 'Domain and subject matched sanitized pilot fixture.',
        selected: true,
      },
    ],
    sourceDocument: {
      id: 'document-1',
      kind: 'ATTACHMENT_TABLE',
      documentIndex: 0,
      label: 'pilot-price-list.xlsx',
      textContent: 'ATTACHMENT_CONTENT_SHOULD_NOT_RENDER',
      metadata: {
        checksum: 'safe-fixture-checksum',
      },
    },
    offerCorrections: [appliedCorrection],
    relatedOfferCorrections: [appliedCorrection],
  },
  inboundEmail: {
    id: inboundEmailId,
    fromEmail: 'Pilot Supplier <pilot.supplier@example.test>',
    fromName: 'Pilot Supplier',
    subject: 'Pilot sanitized supplier offer',
    receivedAt: '2026-06-03T11:55:00.000Z',
    rawHtml: '<p>RAW_SOURCE_BODY_SHOULD_NOT_RENDER</p>',
    rawText:
      'RAW_SOURCE_BODY_SHOULD_NOT_RENDER token=source-secret GRAPH_PAYLOAD_SHOULD_NOT_RENDER TELEGRAM_PAYLOAD_SHOULD_NOT_RENDER',
    triageStatus: 'REVIEW_REQUIRED',
    processingStatus: 'STAGED_FOR_REVIEW',
    reviewReason: 'promotion_threshold_not_met',
    documents: [
      {
        id: 'document-1',
        kind: 'ATTACHMENT_TABLE',
        documentIndex: 0,
        label: 'pilot-price-list.xlsx',
        textContent: 'ATTACHMENT_CONTENT_SHOULD_NOT_RENDER',
        metadata: {
          checksum: 'safe-fixture-checksum',
        },
      },
    ],
  },
  supplierContact: {
    companyName: 'Pilot Supplier Ltd',
    contactName: 'Pilot Contact',
    email: 'pilot.contact@example.test',
    phone: '+44 20 0000 0000',
    domain: 'example.test',
    source: 'SANITIZED_FIXTURE',
  },
  buyDecision: {
    id: 'buy-1',
    approvalStatus: 'APPROVED',
    orderStatus: 'PENDING',
  },
  buyDecisionEvidence: {
    estimatedMarginAmount: 3.2,
    estimatedMarginCurrencyCode: 'GBP',
    estimatedMarginPct: 0.28,
    recentUnitsSold: 42,
    recentDemandWindowDays: 30,
    stockOnHand: 6,
    stockPositionLabel: 'Low stock in fake demo data',
    stockRisk: 'Low stock supports review before ordering',
    expiryRisk: 'No near-expiry risk in fake demo data',
    priceConfidence: 79,
    missingEvidence: ['Customer outreach approval not reviewed'],
    nextRecommendedAction:
      'Review corrected supplier terms before any execution.',
  },
};

const readinessReport = {
  generatedAt,
  status: 'warning',
  checks: [
    {
      key: 'internal-api',
      title: 'Internal API',
      status: 'ready',
      meaning: 'The mocked internal API is reachable for browser smoke tests.',
      nextAction: 'Use fixture-only data for this browser walkthrough.',
      envVars: ['INTERNAL_API_BASE_URL'],
      documentationPath: 'docs/pilot-operator-walkthrough.md',
      details: {
        mode: 'sanitized-browser-smoke',
        liveIntegrationsEnabled: false,
      },
    },
    {
      key: 'graph-mail-preflight',
      title: 'Graph mail preflight',
      status: 'not_configured',
      meaning: 'Live mailbox polling is disabled for this browser smoke test.',
      nextAction:
        'Keep Microsoft Graph credentials unset during the browser smoke run.',
      envVars: ['GRAPH_MAIL_POLLING_ENABLED'],
      details: {
        mailbox: 'disabled',
        credentialSource: 'none',
        credentialMode: 'disabled',
        pollingEnabled: false,
        allowedSenderCount: 0,
        supplierMappingCount: 0,
        dryRunSafe: true,
        warnings: ['Fixture mode only; no mailbox calls are made.'],
      },
    },
  ],
};

const workers = [
  {
    name: 'email-inbound',
    enabled: true,
    configured: true,
    active: true,
    running: true,
    inFlight: false,
    intervalMs: 60_000,
    startedAt: '2026-06-03T11:30:00.000Z',
    stoppedAt: null,
    lastRunStartedAt: '2026-06-03T11:40:00.000Z',
    lastRunFinishedAt: '2026-06-03T11:40:05.000Z',
    lastSuccessAt: '2026-06-03T11:40:05.000Z',
    lastErrorAt: '2026-06-03T11:20:00.000Z',
    lastError:
      'postgresql://pilot:secret@example.invalid/db token=raw-worker-secret pilot.supplier@example.test',
    consecutiveFailures: 0,
    totalRuns: 3,
    totalItemsSeen: 2,
    totalItemsProcessed: 1,
    totalItemsSkipped: 1,
    totalItemsFailed: 0,
    duplicateItemsSkipped: 0,
  },
  {
    name: 'telegram',
    enabled: false,
    configured: false,
    active: false,
    running: false,
    inFlight: false,
    intervalMs: null,
    startedAt: null,
    stoppedAt: null,
    lastRunStartedAt: null,
    lastRunFinishedAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastError: null,
    consecutiveFailures: 0,
    totalRuns: 0,
    totalItemsSeen: 0,
    totalItemsProcessed: 0,
    totalItemsSkipped: 0,
    totalItemsFailed: 0,
    duplicateItemsSkipped: 0,
  },
];

const auditHistory = [
  {
    id: 'audit-1',
    entityType: 'OFFER_CORRECTION',
    entityId: 'correction-1',
    actionType: 'OFFER_CORRECTED',
    previousStatus: 'APPROVED_TO_BUY',
    newStatus: 'NEEDS_INFO',
    actorType: 'OPERATOR',
    actorIdentifier: 'pilot-operator',
    note: 'Safe correction recorded for pilot walkthrough.',
    metadata: {
      commercialAudit: {
        source: {
          sourceKind: 'STRICT_ATTACHMENT_TABLE',
          sourceReviewReason: 'promotion_threshold_not_met',
          sourceDocumentId: 'document-1',
        },
      },
    },
    createdAt: '2026-06-03T11:59:00.000Z',
  },
];

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    'content-type': 'application/json',
    'x-request-id': 'safe-e2e-mock-request',
  });
  response.end(JSON.stringify(body));
}

function route(pathname: string) {
  if (pathname === '/api/health') {
    return { ok: true };
  }

  if (pathname === '/api/system/readiness') {
    return { item: readinessReport };
  }

  if (pathname === '/api/system/workers') {
    return { items: workers };
  }

  if (pathname === '/api/review-queue') {
    return { items: [] };
  }

  if (pathname === '/api/review-queue/workflows') {
    return { items: [workflowListItem] };
  }

  if (pathname === `/api/review-queue/workflows/${workflowItemId}`) {
    return { item: workflowDetail };
  }

  if (
    pathname === `/api/review-queue/workflows/${workflowItemId}/audit-history`
  ) {
    return { items: auditHistory };
  }

  return null;
}

const portArgIndex = process.argv.indexOf('--port');
const port = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : 4410;

const server = createServer((request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Missing URL.' });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  const body = route(url.pathname);

  if (!body) {
    sendJson(response, 404, {
      error: 'Fixture endpoint not found.',
      path: url.pathname,
    });
    return;
  }

  sendJson(response, 200, body);
});

server.listen(port, '127.0.0.1');
