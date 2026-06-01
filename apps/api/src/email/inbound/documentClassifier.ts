import {
  evidence,
  extractDomainFromEmail,
  normaliseText,
  safeSnippet,
} from './signalExtractors';
import {
  normaliseInternetMessageHeaders,
  parseForwardedHeaderBlocks,
} from './forwardHeaderParser';
import type {
  ClassificationConfidence,
  ClassificationDecision,
  ClassificationEvidence,
  ClassificationEvidenceSource,
  ClassificationRouting,
  InboundDocumentClass,
  Rfc5322Header,
} from './types';

export const INBOUND_DOCUMENT_CLASSIFIER_VERSION =
  'inbound-document-classifier-v2';
export type { ClassificationDecision } from './types';

export type DocumentClassifierAttachment = {
  attachmentId?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileType?: string | null;
  disposition?: string | null;
};

export type DocumentClassifierAttachmentText = {
  attachmentId?: string | null;
  fileName?: string | null;
  text?: string | null;
  method?: 'PDF_TEXT' | 'IMAGE_OCR' | string | null;
  page?: number | null;
};

export type DocumentClassifierTable = {
  attachmentId?: string | null;
  fileName?: string | null;
  headers?: string[];
  rows?: Array<Record<string, unknown>>;
};

export type DocumentClassifierSupplierMapping = {
  pattern?: string | null;
  supplierName?: string | null;
  domain?: string | null;
};

export type DocumentClassifierInput = {
  fromEmail?: string | null;
  fromName?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  replyTo?: Array<{ email: string; name?: string | null }> | null;
  senderDomain?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  internetMessageHeaders?: Rfc5322Header[] | null;
  attachments?: DocumentClassifierAttachment[];
  attachmentTexts?: DocumentClassifierAttachmentText[];
  tables?: DocumentClassifierTable[];
  trustedSender?: boolean;
  knownSupplierMappings?: DocumentClassifierSupplierMapping[];
  sourceTemplateFingerprint?: string | null;
};

type ScoredClass = Exclude<InboundDocumentClass, 'UNKNOWN_OR_AMBIGUOUS'>;

type Rule = {
  documentClass: ScoredClass;
  signal: string;
  pattern: RegExp;
  weight: number;
  sourceWeight?: Partial<Record<ClassificationEvidenceSource, number>>;
};

const SCORED_CLASSES: ScoredClass[] = [
  'ACCOUNT_OPENING_FORM',
  'SUPPLIER_PRICE_LIST',
  'SUPPLIER_CONTACT_FORM',
  'SUPPLIER_ONBOARDING_OR_KYC',
  'INVENTORY_REPORT',
  'SALES_REPORT',
  'INVOICE',
  'STATEMENT',
  'ORDER_CONFIRMATION',
  'DELIVERY_NOTE',
];

const STRONG_BLOCKER_CLASSES: ScoredClass[] = [
  'INVOICE',
  'STATEMENT',
  'ORDER_CONFIRMATION',
  'DELIVERY_NOTE',
];

const TEXT_RULES: Rule[] = [
  {
    documentClass: 'ACCOUNT_OPENING_FORM',
    signal: 'explicit account-opening form',
    pattern:
      /\b(account\s+opening\s+form|new\s+account\s+(?:form|application)|credit\s+account\s+application|trade\s+account\s+application|customer\s+account\s+application|wholesale\s+account\s+application|open\s+(?:a\s+)?(?:new\s+)?account)\b/i,
    weight: 28,
  },
  {
    documentClass: 'ACCOUNT_OPENING_FORM',
    signal: 'account-opening company form structure',
    pattern:
      /\b(company\s+(?:registration|number)|vat\s+(?:number|registration)|registered\s+office|trading\s+name)\b/i,
    weight: 8,
  },
  {
    documentClass: 'ACCOUNT_OPENING_FORM',
    signal: 'account-opening regulated form structure',
    pattern:
      /\b(wda|wholesale\s+dealer|gdp|responsible\s+person|rp\s+name|mhra)\b/i,
    weight: 8,
  },
  {
    documentClass: 'ACCOUNT_OPENING_FORM',
    signal: 'sensitive account-opening section',
    pattern:
      /\b(direct\s+debit|bank\s+authority|personal\s+guarantee|director(?:'s)?\s+guarantee|indemnity|signature)\b/i,
    weight: 5,
  },
  {
    documentClass: 'SUPPLIER_PRICE_LIST',
    signal: 'supplier price list',
    pattern:
      /\b(price\s+list|pricelist|trade\s+prices?|wholesale\s+prices?|supplier\s+(?:quote|quotation|offer)|offer\s+list|stock\s+offer)\b/i,
    weight: 18,
  },
  {
    documentClass: 'SUPPLIER_PRICE_LIST',
    signal: 'commercial product pricing fields',
    pattern:
      /\b(pack\s+size|unit\s+price|net\s+price|moq|expiry|batch|available\s+qty|quantity\s+available)\b/i,
    weight: 9,
  },
  {
    documentClass: 'SUPPLIER_CONTACT_FORM',
    signal: 'supplier contact form',
    pattern:
      /\b(supplier\s+(?:contact|details|profile|information)\s+(?:form|sheet|update)?|vendor\s+(?:contact|details|profile)|contact\s+details\s+form)\b/i,
    weight: 18,
  },
  {
    documentClass: 'SUPPLIER_ONBOARDING_OR_KYC',
    signal: 'supplier onboarding or KYC',
    pattern:
      /\b(supplier\s+onboarding|vendor\s+onboarding|kyc|know\s+your\s+(?:customer|supplier)|due\s+diligence|supplier\s+questionnaire|vendor\s+registration)\b/i,
    weight: 20,
  },
  {
    documentClass: 'INVENTORY_REPORT',
    signal: 'inventory report',
    pattern:
      /\b(inventory\s+(?:report|export)|stock\s+(?:report|holding|position|on\s+hand)|warehouse\s+stock)\b/i,
    weight: 18,
  },
  {
    documentClass: 'SALES_REPORT',
    signal: 'sales report',
    pattern:
      /\b(sales\s+(?:report|export|summary)|customer\s+sales|sell\s+through|sold\s+qty|revenue\s+report)\b/i,
    weight: 18,
  },
  {
    documentClass: 'INVOICE',
    signal: 'invoice',
    pattern: /\b(invoice|tax\s+invoice|proforma\s+invoice)\b/i,
    weight: 24,
  },
  {
    documentClass: 'STATEMENT',
    signal: 'statement',
    pattern:
      /\b(statement\s+of\s+account|account\s+statement|monthly\s+statement|remittance\s+statement)\b/i,
    weight: 24,
  },
  {
    documentClass: 'ORDER_CONFIRMATION',
    signal: 'order confirmation',
    pattern:
      /\b(order\s+confirmation|order\s+acknowledg(?:e)?ment|confirmed\s+order)\b/i,
    weight: 24,
  },
  {
    documentClass: 'DELIVERY_NOTE',
    signal: 'delivery note',
    pattern:
      /\b(delivery\s+note|goods\s+received\s+note|dispatch\s+note|despatch\s+note|packing\s+slip)\b/i,
    weight: 24,
  },
];

const TABLE_RULES: Array<{
  documentClass: ScoredClass;
  signal: string;
  required: RegExp[];
  optional?: RegExp[];
  weight: number;
}> = [
  {
    documentClass: 'SUPPLIER_PRICE_LIST',
    signal: 'product price table headers',
    required: [
      /\b(product|description|sku|pip|ean|code)\b/i,
      /\b(price|unit\s*price|net|cost)\b/i,
    ],
    optional: [/\b(qty|quantity|stock|available|moq|expiry|batch|pack)\b/i],
    weight: 34,
  },
  {
    documentClass: 'INVENTORY_REPORT',
    signal: 'inventory table headers',
    required: [
      /\b(product|description|sku|item)\b/i,
      /\b(stock|on\s*hand|available|warehouse|quantity)\b/i,
    ],
    optional: [/\b(location|batch|expiry)\b/i],
    weight: 30,
  },
  {
    documentClass: 'SALES_REPORT',
    signal: 'sales table headers',
    required: [
      /\b(customer|account|sold|sales|revenue)\b/i,
      /\b(product|sku|description|item)\b/i,
    ],
    optional: [/\b(date|period|quantity|qty|value|margin)\b/i],
    weight: 30,
  },
  {
    documentClass: 'SUPPLIER_CONTACT_FORM',
    signal: 'supplier contact table headers',
    required: [
      /\b(supplier|vendor|company)\b/i,
      /\b(email|phone|contact|telephone)\b/i,
    ],
    optional: [/\b(address|website|account\s*manager)\b/i],
    weight: 24,
  },
];

type ScoreState = {
  scores: Map<ScoredClass, number>;
  evidence: ClassificationEvidence[];
  negativeEvidence: ClassificationEvidence[];
};

type AttachmentScore = {
  attachmentId: string;
  class: InboundDocumentClass;
  confidence: ClassificationConfidence;
  score: number;
  conflicts: string[];
  evidence: ClassificationEvidence[];
  negativeEvidence: ClassificationEvidence[];
};

export function classifyInboundDocument(
  input: DocumentClassifierInput,
): ClassificationDecision {
  const messageState = createScoreState();

  scanMessageSignals(input, messageState);

  const attachmentDecisions = (input.attachments ?? []).map(
    (attachment, index) => classifyAttachment(input, attachment, index),
  );

  for (const decision of attachmentDecisions) {
    for (const item of decision.evidence) {
      messageState.evidence.push(item);
      if (decision.class !== 'UNKNOWN_OR_AMBIGUOUS') {
        addScore(messageState, decision.class, item.weight, 0.8);
      }
    }
    messageState.negativeEvidence.push(...decision.negativeEvidence);
  }

  const ranked = rankScores(messageState.scores);
  const conflicts = [
    ...detectScoreConflicts(ranked),
    ...detectAttachmentConflicts(attachmentDecisions),
    ...detectAccountOpeningBlockers(ranked, attachmentDecisions),
  ];
  const top = ranked[0];

  if (!top || top.score < 15 || conflicts.length > 0) {
    return buildUnknownDecision({
      score: top?.score ?? 0,
      evidence: messageState.evidence,
      negativeEvidence: messageState.negativeEvidence,
      conflicts,
      attachmentDecisions,
    });
  }

  const secondScore = ranked[1]?.score ?? 0;
  const confidence = confidenceForScore(top.score, secondScore);
  const routing = routingForClass(top.documentClass);
  const safeToAutoRoute = safeAutoRouteFor(top.documentClass, confidence);

  if (
    top.documentClass === 'ACCOUNT_OPENING_FORM' &&
    (!hasStrongAccountOpeningFormEvidence(messageState.evidence) ||
      hasStrongBlocker(ranked))
  ) {
    return buildUnknownDecision({
      score: top.score,
      evidence: messageState.evidence,
      negativeEvidence: [
        ...messageState.negativeEvidence,
        evidence(
          'FORM_STRUCTURE',
          'account-opening did not clear form-evidence and blocker gates',
          -20,
          input.subject,
        ),
      ],
      conflicts: [
        ...conflicts,
        'ACCOUNT_OPENING_FORM requires strong form evidence and no invoice/statement/order/delivery blocker',
      ],
      attachmentDecisions,
    });
  }

  return {
    primaryClass: top.documentClass,
    confidence,
    score: top.score,
    runnerVersion: INBOUND_DOCUMENT_CLASSIFIER_VERSION,
    routing,
    safeToAutoRoute,
    evidence: messageState.evidence,
    negativeEvidence: messageState.negativeEvidence,
    conflicts,
    attachmentDecisions: attachmentDecisions.map(publicAttachmentDecision),
    reason: reasonFor(top.documentClass, confidence, routing, safeToAutoRoute),
  };
}

function classifyAttachment(
  input: DocumentClassifierInput,
  attachment: DocumentClassifierAttachment,
  index: number,
): AttachmentScore {
  const attachmentId =
    attachment.attachmentId?.trim() ||
    attachment.fileName?.trim() ||
    `attachment-${index + 1}`;
  const state = createScoreState();

  scanTextRules('ATTACHMENT_NAME', attachment.fileName, state, {
    attachmentId,
  });
  if (attachment.mimeType) {
    scanTextRules('MIME_TYPE', attachment.mimeType, state, { attachmentId });
  }

  for (const attachmentText of input.attachmentTexts ?? []) {
    if (
      !attachmentTextBelongsToAttachment(
        attachmentText,
        attachment,
        attachmentId,
      )
    ) {
      continue;
    }

    scanTextRules(
      attachmentText.method === 'IMAGE_OCR' ? 'OCR_TEXT' : 'PDF_TEXT',
      attachmentText.text,
      state,
      {
        attachmentId,
        page: attachmentText.page ?? undefined,
      },
    );
  }

  for (const table of input.tables ?? []) {
    if (!tableBelongsToAttachment(table, attachment, attachmentId)) {
      continue;
    }
    scanTable(table, state, attachmentId);
  }

  const ranked = rankScores(state.scores);
  const conflicts = detectScoreConflicts(ranked);
  const top = ranked[0];

  if (!top || top.score < 12 || conflicts.length > 0) {
    return {
      attachmentId,
      class: 'UNKNOWN_OR_AMBIGUOUS',
      confidence: 'LOW',
      score: top?.score ?? 0,
      conflicts,
      evidence: state.evidence,
      negativeEvidence: state.negativeEvidence,
    };
  }

  return {
    attachmentId,
    class: top.documentClass,
    confidence: confidenceForScore(top.score, ranked[1]?.score ?? 0),
    score: top.score,
    conflicts,
    evidence: state.evidence,
    negativeEvidence: state.negativeEvidence,
  };
}

function scanMessageSignals(input: DocumentClassifierInput, state: ScoreState) {
  scanTextRules('FROM', input.fromEmail, state);
  scanTextRules('SENDER', input.senderEmail, state);
  for (const reply of input.replyTo ?? []) {
    scanTextRules('REPLY_TO', reply.email, state);
  }
  scanTextRules('SUBJECT', input.subject, state);
  scanTextRules('BODY', input.bodyText, state);

  const forwardedHeaders = [
    ...normaliseInternetMessageHeaders(input.internetMessageHeaders),
    ...parseForwardedHeaderBlocks(input.bodyText),
  ];
  for (const header of forwardedHeaders) {
    scanTextRules(
      header.source === 'RFC5322_HEADER' ? 'RFC5322_HEADER' : 'BODY',
      `${header.name}: ${header.value}`,
      state,
    );
  }

  const senderDomain = normaliseDomain(
    input.senderDomain ?? extractDomainFromEmail(input.fromEmail),
  );
  if (input.trustedSender && senderDomain) {
    pushEvidence(
      state,
      'SUPPLIER_PRICE_LIST',
      evidence('FROM', 'trusted inbound sender', 4, senderDomain),
    );
  }

  for (const mapping of input.knownSupplierMappings ?? []) {
    const mappingDomain = normaliseDomain(mapping.domain ?? mapping.pattern);
    if (
      !senderDomain ||
      !mappingDomain ||
      !domainMatches(senderDomain, mappingDomain)
    ) {
      continue;
    }

    pushEvidence(
      state,
      'SUPPLIER_PRICE_LIST',
      evidence(
        'TRUSTED_MAPPING',
        'trusted supplier mapping',
        8,
        mapping.supplierName ?? mappingDomain,
      ),
    );
    break;
  }

  if (
    /\b(account\s+statement|statement\s+of\s+account)\b/i.test(
      input.subject ?? '',
    )
  ) {
    state.negativeEvidence.push(
      evidence(
        'SUBJECT',
        'account statement is not account opening',
        -16,
        input.subject,
      ),
    );
  }
}

function scanTextRules(
  source: ClassificationEvidenceSource,
  value: string | null | undefined,
  state: ScoreState,
  options?: { attachmentId?: string; page?: number },
) {
  if (!value) {
    return;
  }

  for (const rule of TEXT_RULES) {
    if (!rule.pattern.test(value)) {
      continue;
    }

    const sourceMultiplier =
      source === 'TABLE_HEADER' || source === 'TABLE_VALUE'
        ? 1.4
        : source === 'OCR_TEXT'
          ? 0.75
          : 1;

    pushEvidence(
      state,
      rule.documentClass,
      evidence(
        source,
        rule.signal,
        Math.round(rule.weight * sourceMultiplier),
        value,
        options,
      ),
    );
  }
}

function scanTable(
  table: DocumentClassifierTable,
  state: ScoreState,
  attachmentId: string,
) {
  const headers = normaliseHeaders(table.headers);
  if (headers.length === 0 && table.rows?.[0]) {
    headers.push(...normaliseHeaders(Object.keys(table.rows[0])));
  }

  const joined = headers.join(' | ');
  for (const rule of TABLE_RULES) {
    const requiredMatched = rule.required.every((pattern) =>
      headers.some((header) => pattern.test(header)),
    );
    if (!requiredMatched) {
      continue;
    }

    const optionalMatched =
      rule.optional?.some((pattern) =>
        headers.some((header) => pattern.test(header)),
      ) ?? false;
    pushEvidence(
      state,
      rule.documentClass,
      evidence(
        'TABLE_HEADER',
        rule.signal,
        rule.weight + (optionalMatched ? 8 : 0),
        table.fileName ? `${table.fileName}: ${joined}` : joined,
        { attachmentId },
      ),
    );
  }
}

function pushEvidence(
  state: ScoreState,
  documentClass: ScoredClass,
  item: ClassificationEvidence,
) {
  state.evidence.push(item);
  addScore(state, documentClass, item.weight);
}

function addScore(
  state: ScoreState,
  documentClass: ScoredClass,
  weight: number,
  multiplier = 1,
) {
  state.scores.set(
    documentClass,
    (state.scores.get(documentClass) ?? 0) + Math.round(weight * multiplier),
  );
}

function createScoreState(): ScoreState {
  return {
    scores: new Map(SCORED_CLASSES.map((documentClass) => [documentClass, 0])),
    evidence: [],
    negativeEvidence: [],
  };
}

function rankScores(scores: Map<ScoredClass, number>) {
  return SCORED_CLASSES.map((documentClass) => ({
    documentClass,
    score: scores.get(documentClass) ?? 0,
  })).sort((left, right) => right.score - left.score);
}

function detectScoreConflicts(
  ranked: Array<{ documentClass: ScoredClass; score: number }>,
): string[] {
  const accountOpeningScore =
    ranked.find((score) => score.documentClass === 'ACCOUNT_OPENING_FORM')
      ?.score ?? 0;
  const commercialScore = ranked.find((score) =>
    ['SUPPLIER_PRICE_LIST', 'INVENTORY_REPORT', 'SALES_REPORT'].includes(
      score.documentClass,
    ),
  );
  const forcedConflicts =
    accountOpeningScore >= 18 && commercialScore && commercialScore.score >= 18
      ? [`ACCOUNT_OPENING_FORM vs ${commercialScore.documentClass}`]
      : [];
  const meaningful = ranked.filter(({ score }) => score >= 18);
  const top = meaningful[0];
  if (!top) {
    return forcedConflicts;
  }

  return [
    ...forcedConflicts,
    ...meaningful
      .slice(1)
      .filter(({ score }) => score >= top.score - 8)
      .map(({ documentClass }) => `${top.documentClass} vs ${documentClass}`),
  ];
}

function detectAttachmentConflicts(attachments: AttachmentScore[]): string[] {
  const classes = Array.from(
    new Set(
      attachments
        .map((attachment) => attachment.class)
        .filter((documentClass) => documentClass !== 'UNKNOWN_OR_AMBIGUOUS'),
    ),
  );

  if (classes.length <= 1) {
    return [];
  }

  return [`mixed attachment classes: ${classes.join(', ')}`];
}

function detectAccountOpeningBlockers(
  ranked: Array<{ documentClass: ScoredClass; score: number }>,
  attachments: AttachmentScore[],
): string[] {
  const accountOpeningScore =
    ranked.find((score) => score.documentClass === 'ACCOUNT_OPENING_FORM')
      ?.score ?? 0;
  if (accountOpeningScore < 18) {
    return [];
  }

  const blockers = ranked
    .filter(
      (score) =>
        STRONG_BLOCKER_CLASSES.includes(score.documentClass) &&
        score.score >= 18,
    )
    .map((score) => score.documentClass);
  const attachmentBlockers = attachments
    .filter((attachment) =>
      STRONG_BLOCKER_CLASSES.includes(attachment.class as ScoredClass),
    )
    .map((attachment) => attachment.class);

  return Array.from(new Set([...blockers, ...attachmentBlockers])).map(
    (blocker) => `ACCOUNT_OPENING_FORM blocked by ${blocker}`,
  );
}

function hasStrongBlocker(
  ranked: Array<{ documentClass: ScoredClass; score: number }>,
): boolean {
  return ranked.some(
    (score) =>
      STRONG_BLOCKER_CLASSES.includes(score.documentClass) && score.score >= 18,
  );
}

function hasStrongAccountOpeningFormEvidence(
  evidenceItems: ClassificationEvidence[],
): boolean {
  const accountOpeningSignals = evidenceItems.filter((item) =>
    /account-opening|account opening|account application|form structure/i.test(
      item.signal,
    ),
  );
  return (
    accountOpeningSignals.reduce((sum, item) => sum + item.weight, 0) >= 28
  );
}

function confidenceForScore(
  score: number,
  secondScore: number,
): ClassificationConfidence {
  if (score >= 28 && score - secondScore >= 8) {
    return 'HIGH';
  }
  if (score >= 28) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function routingForClass(documentClass: ScoredClass): ClassificationRouting {
  switch (documentClass) {
    case 'ACCOUNT_OPENING_FORM':
      return 'ACCOUNT_OPENING_REVIEW';
    case 'SUPPLIER_PRICE_LIST':
      return 'SUPPLIER_IMPORT';
    case 'SUPPLIER_CONTACT_FORM':
      return 'SUPPLIER_CONTACT_REVIEW';
    case 'SUPPLIER_ONBOARDING_OR_KYC':
      return 'SUPPLIER_ONBOARDING_REVIEW';
    case 'INVENTORY_REPORT':
      return 'INVENTORY_IMPORT';
    case 'SALES_REPORT':
      return 'SALES_IMPORT';
    case 'INVOICE':
    case 'STATEMENT':
    case 'ORDER_CONFIRMATION':
    case 'DELIVERY_NOTE':
      return 'ARCHIVE_OR_IGNORE';
  }
}

function safeAutoRouteFor(
  documentClass: ScoredClass,
  confidence: ClassificationConfidence,
): boolean {
  if (confidence !== 'HIGH') {
    return false;
  }

  return [
    'ACCOUNT_OPENING_FORM',
    'SUPPLIER_PRICE_LIST',
    'INVENTORY_REPORT',
    'SALES_REPORT',
    'INVOICE',
    'STATEMENT',
    'ORDER_CONFIRMATION',
    'DELIVERY_NOTE',
  ].includes(documentClass);
}

function reasonFor(
  documentClass: ScoredClass,
  confidence: ClassificationConfidence,
  routing: ClassificationRouting,
  safeToAutoRoute: boolean,
): string {
  if (documentClass === 'ACCOUNT_OPENING_FORM') {
    return 'Account-opening form detected with strong form evidence. Routing is internal review only; no signing, submission, external email, or sensitive-field auto-fill is permitted.';
  }

  if (
    routing === 'SUPPLIER_CONTACT_REVIEW' ||
    routing === 'SUPPLIER_ONBOARDING_REVIEW'
  ) {
    return 'Supplier contact/onboarding material detected. It requires operator review and is not safe for supplier import automation.';
  }

  if (safeToAutoRoute) {
    return `${documentClass} detected with ${confidence.toLowerCase()} confidence and no mixed-document conflicts.`;
  }

  return `${documentClass} detected with ${confidence.toLowerCase()} confidence, but manual review is required before automation.`;
}

function buildUnknownDecision(input: {
  score: number;
  evidence: ClassificationEvidence[];
  negativeEvidence: ClassificationEvidence[];
  conflicts: string[];
  attachmentDecisions: AttachmentScore[];
}): ClassificationDecision {
  return {
    primaryClass: 'UNKNOWN_OR_AMBIGUOUS',
    confidence: 'LOW',
    score: input.score,
    runnerVersion: INBOUND_DOCUMENT_CLASSIFIER_VERSION,
    routing: 'MANUAL_REVIEW',
    safeToAutoRoute: false,
    evidence: input.evidence,
    negativeEvidence: input.negativeEvidence,
    conflicts: input.conflicts,
    attachmentDecisions: input.attachmentDecisions.map(
      publicAttachmentDecision,
    ),
    reason:
      input.conflicts.length > 0
        ? `Manual review required because classifier found conflicting signals: ${input.conflicts.join(', ')}.`
        : 'Manual review required because the document did not contain enough deterministic routing evidence.',
  };
}

function publicAttachmentDecision(input: AttachmentScore) {
  return {
    attachmentId: input.attachmentId,
    class: input.class,
    confidence: input.confidence,
    score: input.score,
    conflicts: input.conflicts,
  };
}

function attachmentTextBelongsToAttachment(
  text: DocumentClassifierAttachmentText,
  attachment: DocumentClassifierAttachment,
  attachmentId: string,
): boolean {
  return Boolean(
    text.attachmentId === attachmentId ||
    (text.fileName &&
      attachment.fileName &&
      text.fileName === attachment.fileName),
  );
}

function tableBelongsToAttachment(
  table: DocumentClassifierTable,
  attachment: DocumentClassifierAttachment,
  attachmentId: string,
): boolean {
  return Boolean(
    table.attachmentId === attachmentId ||
    (table.fileName &&
      attachment.fileName &&
      table.fileName === attachment.fileName),
  );
}

function normaliseHeaders(headers: string[] | undefined): string[] {
  return (headers ?? [])
    .map((header) => String(header).trim().toLowerCase())
    .filter(Boolean);
}

function normaliseDomain(value: string | null | undefined): string | null {
  const trimmed = normaliseText(value).replace(/^@/, '').replace(/^\*\./, '');
  return trimmed || null;
}

function domainMatches(senderDomain: string, mappingDomain: string): boolean {
  return (
    senderDomain === mappingDomain || senderDomain.endsWith(`.${mappingDomain}`)
  );
}

export { safeSnippet };
