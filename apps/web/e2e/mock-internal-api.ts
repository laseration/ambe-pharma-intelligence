import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { URL } from 'node:url';

const generatedAt = '2026-06-03T12:00:00.000Z';
const inboundEmailId = 'inbound-email-1';
const workflowItemId = 'workflow-1';
const tradeCreatedAt = '2026-06-07T10:00:00.000Z';

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

type TradeEnquiry = {
  id: string;
  status:
    | 'NEW'
    | 'REVIEWING'
    | 'MATCHED'
    | 'QUOTED'
    | 'CLOSED'
    | 'REJECTED'
    | 'DUPLICATE'
    | 'SPAM'
    | 'ARCHIVED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  businessType: string | null;
  country: string | null;
  productName: string;
  strength: string | null;
  packSize: string | null;
  quantityRequired: string | null;
  targetMarket: string | null;
  requiredBy: string | null;
  documentationNotes: string | null;
  additionalNotes: string | null;
  source: 'PUBLIC_TRADE_ACCESS';
  reviewNotes: string | null;
  statusUpdatedAt: string | null;
  statusUpdatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

const tradeEnquiries: TradeEnquiry[] = [
  {
    id: 'fixture-trade-enquiry-reviewing',
    status: 'REVIEWING',
    priority: 'URGENT',
    companyName: 'Fixture Urgent Buyer Ltd',
    contactName: 'Fixture Buyer',
    contactEmail: 'fixture.urgent.buyer@example.test',
    contactPhone: null,
    businessType: 'Wholesaler',
    country: 'United Kingdom',
    productName: 'Fixture urgent comparator requirement',
    strength: '20mg',
    packSize: '28 tablets',
    quantityRequired: '60 packs',
    targetMarket: 'United Kingdom',
    requiredBy: '2026-06-09T00:00:00.000Z',
    documentationNotes: 'Fixture internal review requirement.',
    additionalNotes: 'Fixture data only.',
    source: 'PUBLIC_TRADE_ACCESS',
    reviewNotes: 'Fixture is already under review.',
    statusUpdatedAt: '2026-06-07T09:30:00.000Z',
    statusUpdatedBy: 'web-dashboard',
    createdAt: '2026-06-07T09:00:00.000Z',
    updatedAt: '2026-06-07T09:30:00.000Z',
  },
];

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    'content-type': 'application/json',
    'x-request-id': 'safe-e2e-mock-request',
  });
  response.end(JSON.stringify(body));
}

function parseRequestBody(request: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    request.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });

    request.on('error', reject);
  });
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function inferFixturePriority(value: Record<string, unknown>) {
  const notes = `${optionalString(value.additionalNotes) ?? ''} ${
    optionalString(value.documentationNotes) ?? ''
  }`;
  return /\burgent|today|tomorrow|critical\b/i.test(notes)
    ? 'URGENT'
    : 'NORMAL';
}

function filterTradeEnquiries(url: URL) {
  const status = url.searchParams.get('status');
  const priority = url.searchParams.get('priority');
  const company = url.searchParams.get('company')?.trim().toLowerCase();
  const createdFrom = url.searchParams.get('createdFrom');
  const createdTo = url.searchParams.get('createdTo');

  return tradeEnquiries.filter((item) => {
    if (status && item.status !== status) {
      return false;
    }

    if (priority && item.priority !== priority) {
      return false;
    }

    if (company && !item.companyName.toLowerCase().includes(company)) {
      return false;
    }

    if (createdFrom && item.createdAt.slice(0, 10) < createdFrom) {
      return false;
    }

    if (createdTo && item.createdAt.slice(0, 10) > createdTo) {
      return false;
    }

    return true;
  });
}

function route(pathname: string, url: URL) {
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

  if (pathname === '/api/trade/buyer-enquiries') {
    return { items: filterTradeEnquiries(url) };
  }

  const tradeDetailMatch = pathname.match(
    /^\/api\/trade\/buyer-enquiries\/([^/]+)$/,
  );
  const tradeDetailId = tradeDetailMatch?.[1];
  if (tradeDetailId) {
    const item = tradeEnquiries.find(
      (enquiry) => enquiry.id === decodeURIComponent(tradeDetailId),
    );
    return item ? { item } : null;
  }

  return null;
}

const portArgIndex = process.argv.indexOf('--port');
const port = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : 4410;

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Missing URL.' });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === 'POST' && url.pathname === '/public/trade-enquiries') {
    const body = await parseRequestBody(request);
    const companyName = requiredString(body.companyName);
    const contactName = requiredString(body.contactName);
    const contactEmail = requiredString(body.contactEmail).toLowerCase();
    const productName = requiredString(body.productName);

    if (optionalString(body.website)) {
      sendJson(response, 400, {
        error: {
          code: 'BAD_REQUEST',
          message: 'Trade enquiry rejected by validation checks.',
        },
      });
      return;
    }

    if (!companyName || !contactName || !contactEmail || !productName) {
      sendJson(response, 422, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
        },
      });
      return;
    }

    const duplicate = tradeEnquiries.find(
      (item) =>
        item.companyName === companyName &&
        item.contactEmail === contactEmail &&
        item.productName === productName,
    );

    if (duplicate) {
      sendJson(response, 409, {
        error: {
          code: 'CONFLICT',
          message: 'A similar trade enquiry was already submitted recently.',
        },
      });
      return;
    }

    const item: TradeEnquiry = {
      id: `fixture-trade-enquiry-${tradeEnquiries.length + 1}`,
      status: 'NEW',
      priority: inferFixturePriority(body),
      companyName,
      contactName,
      contactEmail,
      contactPhone: optionalString(body.contactPhone),
      businessType: optionalString(body.businessType),
      country: optionalString(body.country),
      productName,
      strength: optionalString(body.strength),
      packSize: optionalString(body.packSize),
      quantityRequired: optionalString(body.quantityRequired),
      targetMarket: optionalString(body.targetMarket),
      requiredBy: optionalString(body.requiredBy),
      documentationNotes: optionalString(body.documentationNotes),
      additionalNotes: optionalString(body.additionalNotes),
      source: 'PUBLIC_TRADE_ACCESS',
      reviewNotes: null,
      statusUpdatedAt: null,
      statusUpdatedBy: null,
      createdAt: tradeCreatedAt,
      updatedAt: tradeCreatedAt,
    };
    tradeEnquiries.unshift(item);

    sendJson(response, 201, {
      item: {
        id: item.id,
        status: item.status,
        createdAt: item.createdAt,
      },
      message:
        'Trade enquiry received for manual review. Availability and pricing are not confirmed by submission.',
    });
    return;
  }

  const tradeStatusMatch = url.pathname.match(
    /^\/api\/trade\/buyer-enquiries\/([^/]+)\/status$/,
  );
  const tradeStatusId = tradeStatusMatch?.[1];
  if (request.method === 'PATCH' && tradeStatusId) {
    const body = await parseRequestBody(request);
    const item = tradeEnquiries.find(
      (enquiry) => enquiry.id === decodeURIComponent(tradeStatusId),
    );

    if (!item) {
      sendJson(response, 404, { error: 'Fixture endpoint not found.' });
      return;
    }

    item.status = requiredString(body.status) as TradeEnquiry['status'];
    item.reviewNotes = optionalString(body.reviewNotes);
    item.statusUpdatedAt = '2026-06-07T10:15:00.000Z';
    item.statusUpdatedBy =
      optionalString(body.actorIdentifier) ?? 'web-dashboard';
    item.updatedAt = item.statusUpdatedAt;

    sendJson(response, 200, { item });
    return;
  }

  const body = route(url.pathname, url);

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
