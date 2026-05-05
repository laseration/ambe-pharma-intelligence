import 'server-only';

type CountByName = {
  name: string;
  count: number;
};

export type DiagnosticsInboundEmail = {
  id: string;
  fromEmail: string;
  subject: string | null;
  processingStatus: string;
  triageStatus: string | null;
  reviewReason: string | null;
  receivedAt: string | null;
  createdAt: string;
};

export type DiagnosticsSupplierPriceItem = {
  id: string;
  rawProductName: string;
  unitPrice: number | string;
  currencyCode: string;
  createdAt: string;
  supplier: { id: string; name: string } | null;
  product: { id: string; name: string } | null;
};

export type DiagnosticsCommercialIntelItem = {
  id: string;
  itemType: string;
  status: string;
  confidence: string;
  productText: string | null;
  supplierName: string | null;
  customerName: string | null;
  evidenceText: string;
  createdAt: string;
};

export type DiagnosticsOpportunity = {
  id: string;
  type: string;
  status: string;
  title: string;
  score: number;
  createdAt: string;
  updatedAt: string;
  product: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
};

export type DiagnosticsAiAssistedItem = {
  id: string;
  kind: 'EMAIL_DERIVED_OFFER' | 'COMMERCIAL_INTEL';
  label: string;
  status: string;
  confidence: string | null;
  createdAt: string;
};

export type PipelineWindowDiagnostics = {
  label: string;
  since: string;
  emailIntake: {
    inboundEmailsReceived: number;
    inboundEmailsIgnored: number;
    inboundEmailsRejected: number;
    inboundEmailsFailed: number;
    inboundEmailsReviewRequired: number;
    latestInboundEmails: DiagnosticsInboundEmail[];
  };
  documentStaging: {
    inboundEmailDocumentsCreated: number;
    extractionRunsCreated: number;
    emailDerivedOffersCreated: number;
    autoPromotedOffers: number;
    reviewRequiredOffers: number;
    rejectedOffers: number;
  };
  reviewWorkflow: {
    openReviewWorkflowItems: number;
    approvedToBuyCount: number;
    rejectedWorkflowCount: number;
    orderedWorkflowCount: number;
    topReviewReasons: CountByName[];
  };
  supplierPriceIntelligence: {
    supplierPriceItemsCreated: number;
    supplierPriceItemsFromEmailApprovedOffersBestEffort: number;
    latestSupplierPriceItems: DiagnosticsSupplierPriceItem[];
  };
  commercialIntel: {
    commercialIntelItemsCreated: number;
    commercialIntelNew: number;
    commercialIntelApproved: number;
    commercialIntelRejected: number;
    commercialIntelExpired: number;
    commercialIntelByType: CountByName[];
    commercialIntelByConfidence: CountByName[];
    latestCommercialIntelItems: DiagnosticsCommercialIntelItem[];
  };
  aiParserVisibility: {
    aiFallbackAttemptedBestEffort: number;
    aiFallbackUsedBestEffort: number;
    aiAssistedOfferCount: number;
    aiAssistedCommercialIntelCount: number;
    latestAiAssistedItems: DiagnosticsAiAssistedItem[];
  };
  opportunities: {
    openOpportunities: number;
    opportunitiesCreated: number;
    opportunitiesByType: CountByName[];
    latestOpportunities: DiagnosticsOpportunity[];
  };
  problems: {
    topReviewReasons: CountByName[];
    topMissingFieldReasons: CountByName[];
    latestFailedEmails: DiagnosticsInboundEmail[];
    latestEmailsWithNoDerivedOffers: DiagnosticsInboundEmail[];
    latestReviewRequiredButNoSupplierPriceItem: Array<{
      id: string;
      inboundEmailId: string | null;
      sourceReviewReason: string | null;
      latestNote: string | null;
      createdAt: string;
      emailDerivedOffer: {
        id: string;
        rawProductText: string | null;
        supplierCandidate: string | null;
        priceCandidate: number | string | null;
        currencyCandidate: string | null;
        reviewReason: string | null;
      } | null;
    }>;
  };
};

export type PipelineDiagnosticsSummary = {
  generatedAt: string;
  windows: {
    last24h: PipelineWindowDiagnostics;
    last7d: PipelineWindowDiagnostics;
  };
};

function getInternalApiBaseUrl(): string {
  return (
    process.env.INTERNAL_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_INTERNAL_API_BASE_URL?.trim() ||
    'http://127.0.0.1:4000/api'
  );
}

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const apiKey =
    process.env.INTERNAL_API_KEY?.trim() || process.env.INTERNAL_ADMIN_API_KEY?.trim() || '';

  if (apiKey) {
    headers['x-internal-api-key'] = apiKey;
    headers['x-internal-caller-name'] = 'web-diagnostics-dashboard';
  }

  return headers;
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getInternalApiBaseUrl()}${path}`, {
    cache: 'no-store',
    headers: buildHeaders(),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Keep the generic status-based message.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function getPipelineDiagnosticsSummary(): Promise<PipelineDiagnosticsSummary> {
  return requestJson<PipelineDiagnosticsSummary>('/diagnostics/pipeline-summary');
}
