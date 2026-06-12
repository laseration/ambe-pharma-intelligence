import { Prisma } from '@prisma/client';

import {
  loadPilotDemoFixture,
  PILOT_DEMO_MARKER,
} from '../fixtures/demo/pilotDemo';
import { env } from '../config/env';
import { db } from '../lib/db';
import { classifyDatabaseUrlForLocalSmoke } from '../startup/localSmokeSafety';

const fixture = loadPilotDemoFixture();

type DemoOfferInput = {
  id: string;
  offerFingerprint: string;
  rawProductText: string;
  normalizedProductNameCandidate: string;
  strengthCandidate: string | null;
  dosageFormCandidate: string | null;
  packSizeCandidate: string | null;
  manufacturerCandidate: string | null;
  supplierCandidate: string;
  priceCandidate: string | null;
  currencyCandidate: string | null;
  minimumOrderQuantityCandidate: number | null;
  availabilityCandidate: string | null;
  reviewReason: string;
};

type DemoWorkflowStatus =
  | 'NEW'
  | 'IN_REVIEW'
  | 'NEEDS_INFO'
  | 'APPROVED_TO_BUY'
  | 'ORDERED';

function demoMetadata(extra?: Record<string, unknown>) {
  return {
    marker: PILOT_DEMO_MARKER,
    fakeDemoData: true,
    externalServicesCalled: false,
    ...extra,
  };
}

async function upsertBaseRecords() {
  const user = await db.user.upsert({
    where: { email: fixture.user.email },
    update: {
      fullName: fixture.user.fullName,
      role: fixture.user.role,
      isActive: true,
    },
    create: {
      id: fixture.user.id,
      email: fixture.user.email,
      fullName: fixture.user.fullName,
      role: fixture.user.role,
    },
  });

  const supplier = await db.supplier.upsert({
    where: { normalizedName: fixture.supplier.normalizedName },
    update: {
      name: fixture.supplier.name,
      country: fixture.supplier.country,
      contactEmail: fixture.supplier.contactEmail,
      isActive: true,
    },
    create: {
      id: fixture.supplier.id,
      name: fixture.supplier.name,
      normalizedName: fixture.supplier.normalizedName,
      country: fixture.supplier.country,
      contactEmail: fixture.supplier.contactEmail,
    },
  });

  const customer = await db.customer.upsert({
    where: { normalizedName: fixture.customer.normalizedName },
    update: {
      name: fixture.customer.name,
      legalEntityName: fixture.customer.legalEntityName,
      country: fixture.customer.country,
      city: fixture.customer.city,
      primaryContactEmail: fixture.customer.primaryContactEmail,
      isActive: true,
    },
    create: {
      id: fixture.customer.id,
      name: fixture.customer.name,
      normalizedName: fixture.customer.normalizedName,
      legalEntityName: fixture.customer.legalEntityName,
      country: fixture.customer.country,
      city: fixture.customer.city,
      primaryContactEmail: fixture.customer.primaryContactEmail,
    },
  });

  const pendingProduct = await upsertProduct(fixture.products.pending);
  const completedProduct = await upsertProduct(fixture.products.completed);

  await db.supplierQualification.upsert({
    where: { supplierId: supplier.id },
    update: {
      qualificationStatus: 'APPROVED',
      trustTier: 'MEDIUM',
      qualificationNote:
        'Fake demo supplier approved for pilot walkthrough only.',
      lastReviewedAt: fixture.commercial.approvedAt,
      reviewedByType: fixture.actor.actorType,
      reviewedByIdentifier: fixture.actor.actorIdentifier,
      requiresManualApproval: false,
      canAutoApproveBuyDecisions: false,
      metadata: demoMetadata(),
    },
    create: {
      id: 'demo-pilot-supplier-qualification',
      supplierId: supplier.id,
      qualificationStatus: 'APPROVED',
      trustTier: 'MEDIUM',
      qualificationNote:
        'Fake demo supplier approved for pilot walkthrough only.',
      lastReviewedAt: fixture.commercial.approvedAt,
      reviewedByType: fixture.actor.actorType,
      reviewedByIdentifier: fixture.actor.actorIdentifier,
      requiresManualApproval: false,
      canAutoApproveBuyDecisions: false,
      metadata: demoMetadata(),
    },
  });

  await db.supplierQualificationEvent.upsert({
    where: { id: 'demo-pilot-supplier-qualification-event' },
    update: {
      newStatus: 'APPROVED',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: 'Fake demo supplier qualification.',
      metadata: demoMetadata(),
    },
    create: {
      id: 'demo-pilot-supplier-qualification-event',
      supplierQualificationId: 'demo-pilot-supplier-qualification',
      actionType: 'APPROVED',
      previousStatus: null,
      newStatus: 'APPROVED',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: 'Fake demo supplier qualification.',
      metadata: demoMetadata(),
    },
  });

  return {
    user,
    supplier,
    customer,
    pendingProduct,
    completedProduct,
  };
}

async function upsertProduct(product: {
  id: string;
  sku: string;
  name: string;
  normalizedName: string;
  manufacturer: string;
  strength: string;
  dosageForm: string;
  packSize: string;
  aliasName: string;
}) {
  const item = await db.product.upsert({
    where: { sku: product.sku },
    update: {
      name: product.name,
      normalizedName: product.normalizedName,
      manufacturer: product.manufacturer,
      strength: product.strength,
      dosageForm: product.dosageForm,
      packSize: product.packSize,
      isActive: true,
    },
    create: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      normalizedName: product.normalizedName,
      manufacturer: product.manufacturer,
      strength: product.strength,
      dosageForm: product.dosageForm,
      packSize: product.packSize,
    },
  });

  await db.productAlias.upsert({
    where: { id: `${product.id}-alias` },
    update: {
      productId: item.id,
      aliasName: product.aliasName,
      sourceSystem: 'demo-pilot',
    },
    create: {
      id: `${product.id}-alias`,
      productId: item.id,
      aliasName: product.aliasName,
      sourceSystem: 'demo-pilot',
    },
  });

  return item;
}

async function upsertEmailAndOffers(input: {
  supplierId: string;
  pendingProductId: string;
  completedProductId: string;
}) {
  const inboundEmail = await db.inboundEmail.upsert({
    where: {
      sourceSystem_externalMessageId: {
        sourceSystem: fixture.inboundEmail.sourceSystem,
        externalMessageId: fixture.inboundEmail.externalMessageId,
      },
    },
    update: {
      fromEmail: fixture.inboundEmail.fromEmail,
      fromName: fixture.inboundEmail.fromName,
      subject: fixture.inboundEmail.subject,
      rawText: fixture.inboundEmail.rawText,
      bodyHash: fixture.inboundEmail.bodyHash,
      senderDomain: fixture.inboundEmail.senderDomain,
      sourceTemplateFingerprint: fixture.inboundEmail.sourceTemplateFingerprint,
      attachmentSummary: fixture.inboundEmail.attachmentSummary,
      processingStatus: fixture.inboundEmail.processingStatus,
      triageStatus: fixture.inboundEmail.triageStatus,
      sourceTrustScore: fixture.inboundEmail.sourceTrustScore,
      structureConfidence: fixture.inboundEmail.structureConfidence,
      businessWorthinessScore: fixture.inboundEmail.businessWorthinessScore,
      parserConfidence: fixture.inboundEmail.parserConfidence,
      reviewReason: fixture.inboundEmail.reviewReason,
      receivedAt: fixture.inboundEmail.receivedAt,
      processedAt: fixture.inboundEmail.processedAt,
    },
    create: {
      id: fixture.inboundEmail.id,
      sourceSystem: fixture.inboundEmail.sourceSystem,
      externalMessageId: fixture.inboundEmail.externalMessageId,
      internetMessageId: fixture.inboundEmail.internetMessageId,
      conversationId: fixture.inboundEmail.conversationId,
      fromEmail: fixture.inboundEmail.fromEmail,
      fromName: fixture.inboundEmail.fromName,
      subject: fixture.inboundEmail.subject,
      rawText: fixture.inboundEmail.rawText,
      bodyHash: fixture.inboundEmail.bodyHash,
      senderDomain: fixture.inboundEmail.senderDomain,
      sourceTemplateFingerprint: fixture.inboundEmail.sourceTemplateFingerprint,
      attachmentSummary: fixture.inboundEmail.attachmentSummary,
      processingStatus: fixture.inboundEmail.processingStatus,
      triageStatus: fixture.inboundEmail.triageStatus,
      sourceTrustScore: fixture.inboundEmail.sourceTrustScore,
      structureConfidence: fixture.inboundEmail.structureConfidence,
      businessWorthinessScore: fixture.inboundEmail.businessWorthinessScore,
      parserConfidence: fixture.inboundEmail.parserConfidence,
      reviewReason: fixture.inboundEmail.reviewReason,
      receivedAt: fixture.inboundEmail.receivedAt,
      processedAt: fixture.inboundEmail.processedAt,
    },
  });

  const document = await db.inboundEmailDocument.upsert({
    where: {
      inboundEmailId_kind_documentIndex: {
        inboundEmailId: inboundEmail.id,
        kind: fixture.document.kind,
        documentIndex: fixture.document.documentIndex,
      },
    },
    update: {
      label: fixture.document.label,
      textContent: fixture.document.textContent,
      metadata: fixture.document.metadata,
    },
    create: {
      id: fixture.document.id,
      inboundEmailId: inboundEmail.id,
      kind: fixture.document.kind,
      documentIndex: fixture.document.documentIndex,
      label: fixture.document.label,
      textContent: fixture.document.textContent,
      metadata: fixture.document.metadata,
    },
  });

  await db.emailExtractionRun.upsert({
    where: { id: fixture.extractionRun.id },
    update: {
      inboundEmailId: inboundEmail.id,
      method: fixture.extractionRun.method,
      status: fixture.extractionRun.status,
      extractorVersion: fixture.extractionRun.extractorVersion,
      notes: fixture.extractionRun.notes,
    },
    create: {
      id: fixture.extractionRun.id,
      inboundEmailId: inboundEmail.id,
      method: fixture.extractionRun.method,
      status: fixture.extractionRun.status,
      extractorVersion: fixture.extractionRun.extractorVersion,
      notes: fixture.extractionRun.notes,
    },
  });

  const pendingOffer = await upsertOffer({
    offer: fixture.offers.pending,
    inboundEmailId: inboundEmail.id,
    documentId: document.id,
    supplierId: input.supplierId,
    productId: input.pendingProductId,
  });
  const completedOffer = await upsertOffer({
    offer: fixture.offers.completed,
    inboundEmailId: inboundEmail.id,
    documentId: document.id,
    supplierId: input.supplierId,
    productId: input.completedProductId,
  });

  return {
    inboundEmail,
    document,
    pendingOffer,
    completedOffer,
  };
}

async function upsertOffer(input: {
  offer: DemoOfferInput;
  inboundEmailId: string;
  documentId: string;
  extractionRunId?: string;
  supplierId: string | null;
  productId: string | null;
  sourceBlockText?: string;
  sourceTrustScore?: number;
  structureConfidence?: number;
  fieldConfidence?: number;
  entityResolutionConfidence?: number;
  promotionConfidence?: number;
  aiAssisted?: boolean;
  productResolutionConfidence?: number;
  supplierResolutionConfidence?: number;
  scenarioKey?: string;
  scenarioLabel?: string;
}) {
  const sourceBlockText = input.sourceBlockText ?? fixture.inboundEmail.rawText;
  const extractionRunId = input.extractionRunId ?? fixture.extractionRun.id;
  const priceCandidate = input.offer.priceCandidate
    ? new Prisma.Decimal(input.offer.priceCandidate)
    : null;
  const sourceTrustScore = input.sourceTrustScore ?? 72;
  const structureConfidence = input.structureConfidence ?? 88;
  const fieldConfidence = input.fieldConfidence ?? 86;
  const entityResolutionConfidence = input.entityResolutionConfidence ?? 84;
  const promotionConfidence = input.promotionConfidence ?? 68;
  const productResolutionConfidence =
    input.productResolutionConfidence ?? entityResolutionConfidence;
  const supplierResolutionConfidence =
    input.supplierResolutionConfidence ?? entityResolutionConfidence;
  const metadata = demoMetadata({
    walkthroughOffer: input.offer.id,
    scenarioKey: input.scenarioKey,
    scenarioLabel: input.scenarioLabel,
  });
  const offer = await db.emailDerivedOffer.upsert({
    where: {
      inboundEmailId_offerFingerprint: {
        inboundEmailId: input.inboundEmailId,
        offerFingerprint: input.offer.offerFingerprint,
      },
    },
    update: {
      extractionRunId,
      sourceDocumentId: input.documentId,
      status: 'REVIEW_REQUIRED',
      sourceKind: 'EMAIL_BODY',
      sourceBlockText,
      rawProductText: input.offer.rawProductText,
      normalizedProductNameCandidate:
        input.offer.normalizedProductNameCandidate,
      strengthCandidate: input.offer.strengthCandidate,
      dosageFormCandidate: input.offer.dosageFormCandidate,
      packSizeCandidate: input.offer.packSizeCandidate,
      manufacturerCandidate: input.offer.manufacturerCandidate,
      supplierCandidate: input.offer.supplierCandidate,
      priceCandidate,
      currencyCandidate: input.offer.currencyCandidate,
      minimumOrderQuantityCandidate: input.offer.minimumOrderQuantityCandidate,
      availabilityCandidate: input.offer.availabilityCandidate,
      sourceTrustScore,
      structureConfidence,
      fieldConfidence,
      entityResolutionConfidence,
      promotionConfidence,
      aiAssisted: input.aiAssisted ?? false,
      reviewReason: input.offer.reviewReason,
      metadata,
    },
    create: {
      id: input.offer.id,
      inboundEmailId: input.inboundEmailId,
      extractionRunId,
      sourceDocumentId: input.documentId,
      status: 'REVIEW_REQUIRED',
      sourceKind: 'EMAIL_BODY',
      sourceBlockText,
      rawProductText: input.offer.rawProductText,
      normalizedProductNameCandidate:
        input.offer.normalizedProductNameCandidate,
      strengthCandidate: input.offer.strengthCandidate,
      dosageFormCandidate: input.offer.dosageFormCandidate,
      packSizeCandidate: input.offer.packSizeCandidate,
      manufacturerCandidate: input.offer.manufacturerCandidate,
      supplierCandidate: input.offer.supplierCandidate,
      priceCandidate,
      currencyCandidate: input.offer.currencyCandidate,
      minimumOrderQuantityCandidate: input.offer.minimumOrderQuantityCandidate,
      availabilityCandidate: input.offer.availabilityCandidate,
      sourceTrustScore,
      structureConfidence,
      fieldConfidence,
      entityResolutionConfidence,
      promotionConfidence,
      aiAssisted: input.aiAssisted ?? false,
      reviewReason: input.offer.reviewReason,
      offerFingerprint: input.offer.offerFingerprint,
      metadata,
    },
  });

  const evidenceWrites = [
    upsertResolutionCandidate({
      id: `${offer.id}-product-candidate`,
      emailDerivedOfferId: offer.id,
      entityType: 'PRODUCT',
      candidateId: input.productId,
      candidateName: input.offer.rawProductText,
      confidence: productResolutionConfidence,
      reason: input.productId
        ? 'Fake demo product candidate for local-runtime smoke.'
        : 'Fake demo product match intentionally unresolved.',
      selected: Boolean(input.productId),
    }),
    upsertResolutionCandidate({
      id: `${offer.id}-supplier-candidate`,
      emailDerivedOfferId: offer.id,
      entityType: 'SUPPLIER',
      candidateId: input.supplierId,
      candidateName: input.offer.supplierCandidate,
      confidence: supplierResolutionConfidence,
      reason: input.supplierId
        ? 'Fake demo supplier candidate for local-runtime smoke.'
        : 'Fake demo supplier intentionally unresolved.',
      selected: Boolean(input.supplierId),
    }),
    input.offer.currencyCandidate && input.offer.priceCandidate
      ? upsertOfferEvidence({
          id: `${offer.id}-price-evidence`,
          emailDerivedOfferId: offer.id,
          sourceDocumentId: input.documentId,
          fieldName: 'priceCandidate',
          rawText: `${input.offer.currencyCandidate} ${input.offer.priceCandidate}`,
        })
      : upsertOfferEvidence({
          id: `${offer.id}-commercial-terms-evidence`,
          emailDerivedOfferId: offer.id,
          sourceDocumentId: input.documentId,
          fieldName: 'commercialTerms',
          rawText: 'Fake scenario has missing price or currency.',
        }),
    upsertOfferEvidence({
      id: `${offer.id}-product-evidence`,
      emailDerivedOfferId: offer.id,
      sourceDocumentId: input.documentId,
      fieldName: 'rawProductText',
      rawText: input.offer.rawProductText,
    }),
  ];

  await Promise.all(evidenceWrites);

  return offer;
}

async function upsertResolutionCandidate(input: {
  id: string;
  emailDerivedOfferId: string;
  entityType: 'PRODUCT' | 'SUPPLIER' | 'MANUFACTURER';
  candidateId: string | null;
  candidateName: string;
  confidence: number;
  reason: string;
  selected: boolean;
}) {
  await db.entityResolutionCandidate.upsert({
    where: { id: input.id },
    update: {
      candidateId: input.candidateId,
      candidateName: input.candidateName,
      confidence: input.confidence,
      reason: input.reason,
      selected: input.selected,
      metadata: demoMetadata(),
    },
    create: {
      ...input,
      metadata: demoMetadata(),
    },
  });
}

async function upsertOfferEvidence(input: {
  id: string;
  emailDerivedOfferId: string;
  sourceDocumentId: string;
  fieldName: string;
  rawText: string;
}) {
  await db.emailDerivedOfferEvidence.upsert({
    where: { id: input.id },
    update: {
      sourceDocumentId: input.sourceDocumentId,
      fieldName: input.fieldName,
      rawText: input.rawText,
      confidence: 88,
      metadata: demoMetadata(),
    },
    create: {
      ...input,
      evidenceType: 'EXACT_TEXT',
      confidence: 88,
      metadata: demoMetadata(),
    },
  });
}

async function upsertWorkflow(input: {
  workflowId: string;
  offerId: string;
  inboundEmailId: string;
  status: DemoWorkflowStatus;
  note: string;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityReason?: string;
  aiAssisted?: boolean;
  hasUnresolvedSupplier?: boolean;
  hasConflictingSupplierCues?: boolean;
  hasManufacturerAmbiguity?: boolean;
  supplierQualificationStatus?:
    | 'UNKNOWN'
    | 'PENDING_REVIEW'
    | 'APPROVED'
    | 'RESTRICTED'
    | 'BLOCKED';
  hasUnknownSupplierQualification?: boolean;
  hasRestrictedSupplier?: boolean;
  hasBlockedSupplier?: boolean;
  qualificationRiskNote?: string | null;
  scenarioKey?: string;
  scenarioLabel?: string;
}) {
  const priority =
    input.priority ?? (input.status === 'NEW' ? 'HIGH' : 'MEDIUM');
  const priorityReason =
    input.priorityReason ??
    (input.status === 'NEW'
      ? 'Fake demo item waiting for operator approval.'
      : 'Fake demo item already approved and ordered.');
  const supplierQualificationStatus =
    input.supplierQualificationStatus ?? 'APPROVED';
  const workflowMetadata = demoMetadata({
    scenarioKey: input.scenarioKey,
    scenarioLabel: input.scenarioLabel,
  });
  const workflow = await db.offerWorkflowItem.upsert({
    where: { emailDerivedOfferId: input.offerId },
    update: {
      inboundEmailId: input.inboundEmailId,
      status: input.status,
      priority,
      priorityReason,
      assigneeLabel: 'Demo operator',
      latestNote: input.note,
      sourceKind: 'EMAIL_BODY',
      sourceReviewReason: input.note,
      aiAssisted: input.aiAssisted ?? false,
      hasUnresolvedSupplier: input.hasUnresolvedSupplier ?? false,
      hasConflictingSupplierCues: input.hasConflictingSupplierCues ?? false,
      hasManufacturerAmbiguity: input.hasManufacturerAmbiguity ?? false,
      supplierQualificationStatus,
      hasUnknownSupplierQualification:
        input.hasUnknownSupplierQualification ??
        supplierQualificationStatus === 'UNKNOWN',
      hasRestrictedSupplier: input.hasRestrictedSupplier ?? false,
      hasBlockedSupplier: input.hasBlockedSupplier ?? false,
      qualificationRiskNote: input.qualificationRiskNote ?? null,
      createdByType: 'SYSTEM',
      createdByIdentifier: 'demo-pilot-seed',
      completedAt:
        input.status === 'ORDERED' ? fixture.commercial.orderedAt : null,
    },
    create: {
      id: input.workflowId,
      emailDerivedOfferId: input.offerId,
      inboundEmailId: input.inboundEmailId,
      status: input.status,
      priority,
      priorityReason,
      assigneeLabel: 'Demo operator',
      latestNote: input.note,
      sourceKind: 'EMAIL_BODY',
      sourceReviewReason: input.note,
      aiAssisted: input.aiAssisted ?? false,
      hasUnresolvedSupplier: input.hasUnresolvedSupplier ?? false,
      hasConflictingSupplierCues: input.hasConflictingSupplierCues ?? false,
      hasManufacturerAmbiguity: input.hasManufacturerAmbiguity ?? false,
      supplierQualificationStatus,
      hasUnknownSupplierQualification:
        input.hasUnknownSupplierQualification ??
        supplierQualificationStatus === 'UNKNOWN',
      hasRestrictedSupplier: input.hasRestrictedSupplier ?? false,
      hasBlockedSupplier: input.hasBlockedSupplier ?? false,
      qualificationRiskNote: input.qualificationRiskNote ?? null,
      createdByType: 'SYSTEM',
      createdByIdentifier: 'demo-pilot-seed',
      completedAt:
        input.status === 'ORDERED' ? fixture.commercial.orderedAt : null,
    },
  });

  await db.offerWorkflowEvent.upsert({
    where: { id: `${input.workflowId}-created-event` },
    update: {
      newStatus: 'NEW',
      actorType: 'SYSTEM',
      actorIdentifier: 'demo-pilot-seed',
      note: input.note,
      metadata: workflowMetadata,
    },
    create: {
      id: `${input.workflowId}-created-event`,
      workflowItemId: workflow.id,
      actionType: 'CREATED',
      previousStatus: null,
      newStatus: 'NEW',
      actorType: 'SYSTEM',
      actorIdentifier: 'demo-pilot-seed',
      note: input.note,
      metadata: workflowMetadata,
    },
  });

  if (input.status === 'IN_REVIEW' || input.status === 'NEEDS_INFO') {
    const eventId = `${input.workflowId}-${input.status.toLowerCase()}-event`;
    const actionType =
      input.status === 'IN_REVIEW' ? 'STARTED_REVIEW' : 'MARKED_NEEDS_INFO';
    await db.offerWorkflowEvent.upsert({
      where: { id: eventId },
      update: {
        previousStatus: 'NEW',
        newStatus: input.status,
        actorType: fixture.actor.actorType,
        actorIdentifier: fixture.actor.actorIdentifier,
        note: input.note,
        metadata: workflowMetadata,
      },
      create: {
        id: eventId,
        workflowItemId: workflow.id,
        actionType,
        previousStatus: 'NEW',
        newStatus: input.status,
        actorType: fixture.actor.actorType,
        actorIdentifier: fixture.actor.actorIdentifier,
        note: input.note,
        metadata: workflowMetadata,
      },
    });
  }

  if (input.status === 'APPROVED_TO_BUY' || input.status === 'ORDERED') {
    await db.offerWorkflowEvent.upsert({
      where: { id: `${input.workflowId}-approved-event` },
      update: {
        previousStatus: 'NEW',
        newStatus: 'APPROVED_TO_BUY',
        actorType: fixture.actor.actorType,
        actorIdentifier: fixture.actor.actorIdentifier,
        note: 'Fake demo approval created by demo seed.',
        metadata: workflowMetadata,
      },
      create: {
        id: `${input.workflowId}-approved-event`,
        workflowItemId: workflow.id,
        actionType: 'APPROVED_TO_BUY',
        previousStatus: 'NEW',
        newStatus: 'APPROVED_TO_BUY',
        actorType: fixture.actor.actorType,
        actorIdentifier: fixture.actor.actorIdentifier,
        note: 'Fake demo approval created by demo seed.',
        metadata: workflowMetadata,
      },
    });
  }

  if (input.status === 'ORDERED') {
    await db.offerWorkflowEvent.upsert({
      where: { id: `${input.workflowId}-ordered-event` },
      update: {
        previousStatus: 'APPROVED_TO_BUY',
        newStatus: 'ORDERED',
        actorType: fixture.actor.actorType,
        actorIdentifier: fixture.actor.actorIdentifier,
        note: 'Fake demo order marked by demo seed.',
        metadata: demoMetadata({
          externalOrderReference: fixture.commercial.externalOrderReference,
        }),
      },
      create: {
        id: `${input.workflowId}-ordered-event`,
        workflowItemId: workflow.id,
        actionType: 'MARKED_ORDERED',
        previousStatus: 'APPROVED_TO_BUY',
        newStatus: 'ORDERED',
        actorType: fixture.actor.actorType,
        actorIdentifier: fixture.actor.actorIdentifier,
        note: 'Fake demo order marked by demo seed.',
        metadata: demoMetadata({
          externalOrderReference: fixture.commercial.externalOrderReference,
        }),
      },
    });
  }

  return workflow;
}

async function upsertSafeCorrection(input: {
  workflowId: string;
  offerId: string;
  inboundEmailId: string;
  correctedProductId: string;
}) {
  const correction = await db.offerCorrection.upsert({
    where: { id: `${input.workflowId}-safe-correction` },
    update: {
      emailDerivedOfferId: input.offerId,
      offerWorkflowItemId: input.workflowId,
      inboundEmailId: input.inboundEmailId,
      correctionStatus: 'APPLIED',
      correctedProductId: input.correctedProductId,
      correctedRawProductText:
        'LOCAL_RUNTIME_CORRECTED_RAW_TEXT_SHOULD_NOT_RENDER',
      correctedNormalizedProductName: 'demo amlodipine 5mg tablets 28',
      correctedStrength: '5mg',
      correctedDosageForm: 'Tablet',
      correctedPackSize: '28 tablets',
      correctedManufacturer: 'Demo Generics Ltd',
      correctedUnitPrice: new Prisma.Decimal('7.90'),
      correctedCurrencyCode: 'GBP',
      correctedMinimumOrderQuantity: 100,
      correctedAvailability: 'Available now',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: 'LOCAL_RUNTIME_CORRECTION_NOTE_SHOULD_NOT_RENDER',
      metadata: demoMetadata({
        source: 'disposable-db-backed-browser-smoke',
      }),
    },
    create: {
      id: `${input.workflowId}-safe-correction`,
      emailDerivedOfferId: input.offerId,
      offerWorkflowItemId: input.workflowId,
      inboundEmailId: input.inboundEmailId,
      correctionStatus: 'APPLIED',
      correctedProductId: input.correctedProductId,
      correctedRawProductText:
        'LOCAL_RUNTIME_CORRECTED_RAW_TEXT_SHOULD_NOT_RENDER',
      correctedNormalizedProductName: 'demo amlodipine 5mg tablets 28',
      correctedStrength: '5mg',
      correctedDosageForm: 'Tablet',
      correctedPackSize: '28 tablets',
      correctedManufacturer: 'Demo Generics Ltd',
      correctedUnitPrice: new Prisma.Decimal('7.90'),
      correctedCurrencyCode: 'GBP',
      correctedMinimumOrderQuantity: 100,
      correctedAvailability: 'Available now',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: 'LOCAL_RUNTIME_CORRECTION_NOTE_SHOULD_NOT_RENDER',
      metadata: demoMetadata({
        source: 'disposable-db-backed-browser-smoke',
      }),
    },
  });

  await db.offerCorrectionEvent.upsert({
    where: { id: `${correction.id}-applied-event` },
    update: {
      previousStatus: null,
      newStatus: 'APPLIED',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: 'Safe fake correction recorded for local-runtime browser smoke.',
      metadata: demoMetadata({
        source: 'disposable-db-backed-browser-smoke',
      }),
    },
    create: {
      id: `${correction.id}-applied-event`,
      offerCorrectionId: correction.id,
      actionType: 'APPLIED',
      previousStatus: null,
      newStatus: 'APPLIED',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: 'Safe fake correction recorded for local-runtime browser smoke.',
      metadata: demoMetadata({
        source: 'disposable-db-backed-browser-smoke',
      }),
    },
  });
}

type PilotScenarioSeedInput = {
  key: string;
  label: string;
  product: {
    id: string;
    sku: string;
    name: string;
    normalizedName: string;
    manufacturer: string;
    strength: string;
    dosageForm: string;
    packSize: string;
    aliasName: string;
  };
  supplier?: {
    id: string;
    name: string;
    normalizedName: string;
    country: string;
    contactEmail: string;
    qualificationStatus: 'UNKNOWN' | 'APPROVED' | 'RESTRICTED' | 'BLOCKED';
    qualificationNote: string;
  };
  offer: DemoOfferInput;
  workflow: {
    id: string;
    status: DemoWorkflowStatus;
    note: string;
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
    priorityReason?: string;
    aiAssisted?: boolean;
    hasUnresolvedSupplier?: boolean;
    hasConflictingSupplierCues?: boolean;
    supplierQualificationStatus?:
      | 'UNKNOWN'
      | 'PENDING_REVIEW'
      | 'APPROVED'
      | 'RESTRICTED'
      | 'BLOCKED';
    hasUnknownSupplierQualification?: boolean;
    hasRestrictedSupplier?: boolean;
    hasBlockedSupplier?: boolean;
    qualificationRiskNote?: string | null;
  };
  receivedOffsetMinutes: number;
  productResolutionConfidence?: number;
  supplierResolutionConfidence?: number;
  sourceTrustScore?: number;
  fieldConfidence?: number;
};

async function upsertScenarioSupplier(
  supplier: NonNullable<PilotScenarioSeedInput['supplier']>,
) {
  const record = await db.supplier.upsert({
    where: { normalizedName: supplier.normalizedName },
    update: {
      name: supplier.name,
      country: supplier.country,
      contactEmail: supplier.contactEmail,
      isActive: true,
    },
    create: {
      id: supplier.id,
      name: supplier.name,
      normalizedName: supplier.normalizedName,
      country: supplier.country,
      contactEmail: supplier.contactEmail,
    },
  });

  await db.supplierQualification.upsert({
    where: { supplierId: record.id },
    update: {
      qualificationStatus: supplier.qualificationStatus,
      trustTier: supplier.qualificationStatus === 'APPROVED' ? 'MEDIUM' : 'LOW',
      qualificationNote: supplier.qualificationNote,
      lastReviewedAt: fixture.commercial.approvedAt,
      reviewedByType: fixture.actor.actorType,
      reviewedByIdentifier: fixture.actor.actorIdentifier,
      requiresManualApproval: supplier.qualificationStatus !== 'APPROVED',
      canAutoApproveBuyDecisions: false,
      metadata: demoMetadata({
        scenarioSupplier: supplier.id,
      }),
    },
    create: {
      id: `${supplier.id}-qualification`,
      supplierId: record.id,
      qualificationStatus: supplier.qualificationStatus,
      trustTier: supplier.qualificationStatus === 'APPROVED' ? 'MEDIUM' : 'LOW',
      qualificationNote: supplier.qualificationNote,
      lastReviewedAt: fixture.commercial.approvedAt,
      reviewedByType: fixture.actor.actorType,
      reviewedByIdentifier: fixture.actor.actorIdentifier,
      requiresManualApproval: supplier.qualificationStatus !== 'APPROVED',
      canAutoApproveBuyDecisions: false,
      metadata: demoMetadata({
        scenarioSupplier: supplier.id,
      }),
    },
  });

  return record;
}

async function upsertScenarioEmailOfferWorkflow(input: PilotScenarioSeedInput) {
  const product = await upsertProduct(input.product);
  const supplier = input.supplier
    ? await upsertScenarioSupplier(input.supplier)
    : null;
  const receivedAt = new Date(
    fixture.inboundEmail.receivedAt.getTime() -
      input.receivedOffsetMinutes * 60_000,
  );
  const inboundEmailId = `demo-pilot-scenario-email-${input.key}`;
  const documentId = `demo-pilot-scenario-document-${input.key}`;
  const extractionRunId = `demo-pilot-scenario-extraction-${input.key}`;
  const safeRawTextCanary = `LOCAL_RUNTIME_SCENARIO_RAW_TEXT_SHOULD_NOT_RENDER:${input.key}`;

  const inboundEmail = await db.inboundEmail.upsert({
    where: {
      sourceSystem_externalMessageId: {
        sourceSystem: 'LOCAL_RUNTIME_FAKE',
        externalMessageId: `demo-pilot-scenario-message-${input.key}`,
      },
    },
    update: {
      fromEmail: `scenario-${input.key}@fake-pilot.example.test`,
      fromName: 'Fake pilot scenario sender',
      subject: `FAKE DEMO scenario: ${input.label}`,
      rawText: safeRawTextCanary,
      bodyHash: `demo-pilot-scenario-hash-${input.key}`,
      senderDomain: 'fake-pilot.example.test',
      sourceTemplateFingerprint: `fake-pilot-${input.key}`,
      attachmentSummary: demoMetadata({
        attachmentCount: 0,
        scenarioKey: input.key,
      }),
      processingStatus: 'REVIEW_REQUIRED',
      triageStatus: 'REVIEW_REQUIRED',
      sourceTrustScore: input.sourceTrustScore ?? 72,
      structureConfidence: 80,
      businessWorthinessScore: 70,
      parserConfidence: 'MEDIUM',
      reviewReason: input.workflow.note,
      receivedAt,
      processedAt: receivedAt,
    },
    create: {
      id: inboundEmailId,
      sourceSystem: 'LOCAL_RUNTIME_FAKE',
      externalMessageId: `demo-pilot-scenario-message-${input.key}`,
      internetMessageId: `<demo-pilot-scenario-${input.key}@fake-pilot.example.test>`,
      conversationId: `demo-pilot-scenario-conversation-${input.key}`,
      fromEmail: `scenario-${input.key}@fake-pilot.example.test`,
      fromName: 'Fake pilot scenario sender',
      subject: `FAKE DEMO scenario: ${input.label}`,
      rawText: safeRawTextCanary,
      bodyHash: `demo-pilot-scenario-hash-${input.key}`,
      senderDomain: 'fake-pilot.example.test',
      sourceTemplateFingerprint: `fake-pilot-${input.key}`,
      attachmentSummary: demoMetadata({
        attachmentCount: 0,
        scenarioKey: input.key,
      }),
      processingStatus: 'REVIEW_REQUIRED',
      triageStatus: 'REVIEW_REQUIRED',
      sourceTrustScore: input.sourceTrustScore ?? 72,
      structureConfidence: 80,
      businessWorthinessScore: 70,
      parserConfidence: 'MEDIUM',
      reviewReason: input.workflow.note,
      receivedAt,
      processedAt: receivedAt,
    },
  });

  const document = await db.inboundEmailDocument.upsert({
    where: {
      inboundEmailId_kind_documentIndex: {
        inboundEmailId: inboundEmail.id,
        kind: 'BODY_MAIN',
        documentIndex: 0,
      },
    },
    update: {
      label: `Fake scenario source ${input.key}`,
      textContent: safeRawTextCanary,
      metadata: demoMetadata({
        scenarioKey: input.key,
        scenarioLabel: input.label,
      }),
    },
    create: {
      id: documentId,
      inboundEmailId: inboundEmail.id,
      kind: 'BODY_MAIN',
      documentIndex: 0,
      label: `Fake scenario source ${input.key}`,
      textContent: safeRawTextCanary,
      metadata: demoMetadata({
        scenarioKey: input.key,
        scenarioLabel: input.label,
      }),
    },
  });

  await db.emailExtractionRun.upsert({
    where: { id: extractionRunId },
    update: {
      inboundEmailId: inboundEmail.id,
      method: fixture.extractionRun.method,
      status: fixture.extractionRun.status,
      extractorVersion: fixture.extractionRun.extractorVersion,
      notes: demoMetadata({
        scenarioKey: input.key,
        scenarioLabel: input.label,
      }),
    },
    create: {
      id: extractionRunId,
      inboundEmailId: inboundEmail.id,
      method: fixture.extractionRun.method,
      status: fixture.extractionRun.status,
      extractorVersion: fixture.extractionRun.extractorVersion,
      notes: demoMetadata({
        scenarioKey: input.key,
        scenarioLabel: input.label,
      }),
    },
  });

  const offer = await upsertOffer({
    offer: input.offer,
    inboundEmailId: inboundEmail.id,
    documentId: document.id,
    extractionRunId,
    supplierId: supplier?.id ?? null,
    productId: product.id,
    sourceBlockText: safeRawTextCanary,
    sourceTrustScore: input.sourceTrustScore,
    fieldConfidence: input.fieldConfidence,
    productResolutionConfidence: input.productResolutionConfidence,
    supplierResolutionConfidence: input.supplierResolutionConfidence,
    aiAssisted: input.workflow.aiAssisted,
    scenarioKey: input.key,
    scenarioLabel: input.label,
  });

  const workflow = await upsertWorkflow({
    workflowId: input.workflow.id,
    offerId: offer.id,
    inboundEmailId: inboundEmail.id,
    status: input.workflow.status,
    note: input.workflow.note,
    priority: input.workflow.priority,
    priorityReason: input.workflow.priorityReason,
    aiAssisted: input.workflow.aiAssisted,
    hasUnresolvedSupplier: input.workflow.hasUnresolvedSupplier,
    hasConflictingSupplierCues: input.workflow.hasConflictingSupplierCues,
    supplierQualificationStatus: input.workflow.supplierQualificationStatus,
    hasUnknownSupplierQualification:
      input.workflow.hasUnknownSupplierQualification,
    hasRestrictedSupplier: input.workflow.hasRestrictedSupplier,
    hasBlockedSupplier: input.workflow.hasBlockedSupplier,
    qualificationRiskNote: input.workflow.qualificationRiskNote,
    scenarioKey: input.key,
    scenarioLabel: input.label,
  });

  return {
    inboundEmail,
    document,
    offer,
    product,
    supplier,
    workflow,
  };
}

async function upsertScenarioBuyDecision(input: {
  id: string;
  scenarioKey: string;
  scenarioLabel: string;
  offerId: string;
  workflowId: string;
  inboundEmailId: string;
  supplierId: string | null;
  productId: string;
  rawProductText: string;
  normalizedProductNameCandidate: string;
  manufacturerCandidate: string | null;
  quotedUnitPrice: string | null;
  quotedCurrencyCode: string | null;
  quotedMinimumOrderQuantity: number | null;
  quotedAvailability: string | null;
  supplierQualificationStatus:
    | 'UNKNOWN'
    | 'APPROVED'
    | 'RESTRICTED'
    | 'BLOCKED';
  hasQualificationRisk: boolean;
  qualificationRiskNote: string | null;
  approvalStatus: 'PENDING_APPROVAL' | 'APPROVED';
}) {
  const quotedUnitPrice = input.quotedUnitPrice
    ? new Prisma.Decimal(input.quotedUnitPrice)
    : null;
  const approvedAt =
    input.approvalStatus === 'APPROVED' ? fixture.commercial.approvedAt : null;
  const decision = await db.buyDecision.upsert({
    where: { emailDerivedOfferId: input.offerId },
    update: {
      offerWorkflowItemId: input.workflowId,
      inboundEmailId: input.inboundEmailId,
      supplierId: input.supplierId,
      productId: input.productId,
      rawProductText: input.rawProductText,
      normalizedProductNameCandidate: input.normalizedProductNameCandidate,
      manufacturerCandidate: input.manufacturerCandidate,
      quotedUnitPrice,
      quotedCurrencyCode: input.quotedCurrencyCode,
      quotedMinimumOrderQuantity: input.quotedMinimumOrderQuantity,
      quotedAvailability: input.quotedAvailability,
      sourceKind: 'EMAIL_BODY',
      sourceBlockText: `LOCAL_RUNTIME_SCENARIO_RAW_TEXT_SHOULD_NOT_RENDER:${input.scenarioKey}`,
      supplierQualificationStatus: input.supplierQualificationStatus,
      hasQualificationRisk: input.hasQualificationRisk,
      qualificationRiskNote: input.qualificationRiskNote,
      approvalStatus: input.approvalStatus,
      approvalNote:
        input.approvalStatus === 'APPROVED'
          ? 'Fake scenario approval for local-runtime smoke.'
          : null,
      approvedByType:
        input.approvalStatus === 'APPROVED' ? fixture.actor.actorType : null,
      approvedByIdentifier:
        input.approvalStatus === 'APPROVED'
          ? fixture.actor.actorIdentifier
          : null,
      approvedAt,
      orderStatus: 'NOT_ORDERED',
      metadata: demoMetadata({
        scenarioKey: input.scenarioKey,
        scenarioLabel: input.scenarioLabel,
      }),
    },
    create: {
      id: input.id,
      emailDerivedOfferId: input.offerId,
      offerWorkflowItemId: input.workflowId,
      inboundEmailId: input.inboundEmailId,
      supplierId: input.supplierId,
      productId: input.productId,
      rawProductText: input.rawProductText,
      normalizedProductNameCandidate: input.normalizedProductNameCandidate,
      manufacturerCandidate: input.manufacturerCandidate,
      quotedUnitPrice,
      quotedCurrencyCode: input.quotedCurrencyCode,
      quotedMinimumOrderQuantity: input.quotedMinimumOrderQuantity,
      quotedAvailability: input.quotedAvailability,
      sourceKind: 'EMAIL_BODY',
      sourceBlockText: `LOCAL_RUNTIME_SCENARIO_RAW_TEXT_SHOULD_NOT_RENDER:${input.scenarioKey}`,
      supplierQualificationStatus: input.supplierQualificationStatus,
      hasQualificationRisk: input.hasQualificationRisk,
      qualificationRiskNote: input.qualificationRiskNote,
      approvalStatus: input.approvalStatus,
      approvalNote:
        input.approvalStatus === 'APPROVED'
          ? 'Fake scenario approval for local-runtime smoke.'
          : null,
      approvedByType:
        input.approvalStatus === 'APPROVED' ? fixture.actor.actorType : null,
      approvedByIdentifier:
        input.approvalStatus === 'APPROVED'
          ? fixture.actor.actorIdentifier
          : null,
      approvedAt,
      orderStatus: 'NOT_ORDERED',
      metadata: demoMetadata({
        scenarioKey: input.scenarioKey,
        scenarioLabel: input.scenarioLabel,
      }),
    },
  });

  await db.buyDecisionEvent.upsert({
    where: { id: `${input.id}-created-event` },
    update: {
      newApprovalStatus: input.approvalStatus,
      newOrderStatus: 'NOT_ORDERED',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: `Fake scenario buy decision: ${input.scenarioLabel}.`,
      metadata: demoMetadata({
        scenarioKey: input.scenarioKey,
        scenarioLabel: input.scenarioLabel,
      }),
    },
    create: {
      id: `${input.id}-created-event`,
      buyDecisionId: decision.id,
      actionType: 'CREATED',
      previousApprovalStatus: null,
      newApprovalStatus: input.approvalStatus,
      previousOrderStatus: null,
      newOrderStatus: 'NOT_ORDERED',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: `Fake scenario buy decision: ${input.scenarioLabel}.`,
      metadata: demoMetadata({
        scenarioKey: input.scenarioKey,
        scenarioLabel: input.scenarioLabel,
      }),
    },
  });

  return decision;
}

async function upsertScenarioTradeOpportunity(input: {
  id: string;
  scenarioKey: string;
  scenarioLabel: string;
  offerId: string;
  workflowId: string;
  inboundEmailId: string;
  buyDecisionId?: string | null;
  supplierId: string | null;
  productId: string;
  rawProductText: string;
  normalizedProductNameCandidate: string;
  supplierName: string | null;
  quotedBuyUnitPrice: string | null;
  quotedBuyCurrencyCode: string | null;
  targetSellUnitPrice: string | null;
  targetSellCurrencyCode: string | null;
  estimatedMarginAmount: string | null;
  estimatedMarginPct: string | null;
  quantityTarget: number;
  stage:
    | 'REVIEW'
    | 'READY_FOR_BUY'
    | 'BUY_ORDERED'
    | 'READY_FOR_BUYER_OUTREACH';
  rationale: string;
  riskFlags: string[];
  isMarginFloorMet: boolean;
  isActionable: boolean;
  recentUnitsSold?: number;
  recentDemandWindowDays?: number;
}) {
  const tradeOpportunity = await db.tradeOpportunity.upsert({
    where: { id: input.id },
    update: {
      status: input.isActionable ? 'OPEN' : 'ON_HOLD',
      stage: input.stage,
      sourceType: input.buyDecisionId ? 'BUY_DECISION' : 'WORKFLOW_ITEM',
      emailDerivedOfferId: input.offerId,
      offerWorkflowItemId: input.workflowId,
      inboundEmailId: input.inboundEmailId,
      buyDecisionId: input.buyDecisionId ?? null,
      supplierId: input.supplierId,
      productId: input.productId,
      ownerUserId: fixture.user.id,
      rawProductText: input.rawProductText,
      normalizedProductNameCandidate: input.normalizedProductNameCandidate,
      sourceSupplierNameSnapshot: input.supplierName,
      targetBuyerNameSnapshot: fixture.customer.name,
      targetBuyerCompanySnapshot: fixture.customer.legalEntityName,
      supplierQualificationStatusSnapshot: input.supplierId
        ? 'APPROVED'
        : 'UNKNOWN',
      quotedBuyUnitPrice: input.quotedBuyUnitPrice
        ? new Prisma.Decimal(input.quotedBuyUnitPrice)
        : null,
      quotedBuyCurrencyCode: input.quotedBuyCurrencyCode,
      quotedBuyMinimumOrderQuantity: input.quantityTarget,
      quotedAvailability: 'Fake scenario availability for operator review',
      targetSellUnitPrice: input.targetSellUnitPrice
        ? new Prisma.Decimal(input.targetSellUnitPrice)
        : null,
      targetSellCurrencyCode: input.targetSellCurrencyCode,
      minimumMarginAmount: new Prisma.Decimal('0.25'),
      minimumMarginPct: new Prisma.Decimal('0.1000'),
      estimatedMarginAmount: input.estimatedMarginAmount
        ? new Prisma.Decimal(input.estimatedMarginAmount)
        : null,
      estimatedMarginPct: input.estimatedMarginPct
        ? new Prisma.Decimal(input.estimatedMarginPct)
        : null,
      quantityTarget: input.quantityTarget,
      rationale: input.rationale,
      riskFlags: input.riskFlags,
      hasQualificationBlock: false,
      isMarginFloorMet: input.isMarginFloorMet,
      isActionable: input.isActionable,
      hasMessagingPolicyViolations: false,
      messagingPolicyViolationCount: 0,
      ownerLabel: 'Demo operator',
      createdByType: fixture.actor.actorType,
      createdByIdentifier: fixture.actor.actorIdentifier,
      metadata: demoMetadata({
        scenarioKey: input.scenarioKey,
        scenarioLabel: input.scenarioLabel,
        recentUnitsSold: input.recentUnitsSold ?? 0,
        recentDemandWindowDays: input.recentDemandWindowDays ?? 30,
        likelyBuyers: [
          {
            customerId: fixture.customer.id,
            name: fixture.customer.name,
            units: input.recentUnitsSold ?? 0,
            orderCount: input.recentUnitsSold ? 1 : 0,
            lastSaleAt: fixture.commercial.saleDate.toISOString(),
          },
        ],
      }),
    },
    create: {
      id: input.id,
      status: input.isActionable ? 'OPEN' : 'ON_HOLD',
      stage: input.stage,
      sourceType: input.buyDecisionId ? 'BUY_DECISION' : 'WORKFLOW_ITEM',
      emailDerivedOfferId: input.offerId,
      offerWorkflowItemId: input.workflowId,
      inboundEmailId: input.inboundEmailId,
      buyDecisionId: input.buyDecisionId ?? null,
      supplierId: input.supplierId,
      productId: input.productId,
      ownerUserId: fixture.user.id,
      rawProductText: input.rawProductText,
      normalizedProductNameCandidate: input.normalizedProductNameCandidate,
      sourceSupplierNameSnapshot: input.supplierName,
      targetBuyerNameSnapshot: fixture.customer.name,
      targetBuyerCompanySnapshot: fixture.customer.legalEntityName,
      supplierQualificationStatusSnapshot: input.supplierId
        ? 'APPROVED'
        : 'UNKNOWN',
      quotedBuyUnitPrice: input.quotedBuyUnitPrice
        ? new Prisma.Decimal(input.quotedBuyUnitPrice)
        : null,
      quotedBuyCurrencyCode: input.quotedBuyCurrencyCode,
      quotedBuyMinimumOrderQuantity: input.quantityTarget,
      quotedAvailability: 'Fake scenario availability for operator review',
      targetSellUnitPrice: input.targetSellUnitPrice
        ? new Prisma.Decimal(input.targetSellUnitPrice)
        : null,
      targetSellCurrencyCode: input.targetSellCurrencyCode,
      minimumMarginAmount: new Prisma.Decimal('0.25'),
      minimumMarginPct: new Prisma.Decimal('0.1000'),
      estimatedMarginAmount: input.estimatedMarginAmount
        ? new Prisma.Decimal(input.estimatedMarginAmount)
        : null,
      estimatedMarginPct: input.estimatedMarginPct
        ? new Prisma.Decimal(input.estimatedMarginPct)
        : null,
      quantityTarget: input.quantityTarget,
      rationale: input.rationale,
      riskFlags: input.riskFlags,
      hasQualificationBlock: false,
      isMarginFloorMet: input.isMarginFloorMet,
      isActionable: input.isActionable,
      hasMessagingPolicyViolations: false,
      messagingPolicyViolationCount: 0,
      ownerLabel: 'Demo operator',
      createdByType: fixture.actor.actorType,
      createdByIdentifier: fixture.actor.actorIdentifier,
      metadata: demoMetadata({
        scenarioKey: input.scenarioKey,
        scenarioLabel: input.scenarioLabel,
        recentUnitsSold: input.recentUnitsSold ?? 0,
        recentDemandWindowDays: input.recentDemandWindowDays ?? 30,
        likelyBuyers: [
          {
            customerId: fixture.customer.id,
            name: fixture.customer.name,
            units: input.recentUnitsSold ?? 0,
            orderCount: input.recentUnitsSold ? 1 : 0,
            lastSaleAt: fixture.commercial.saleDate.toISOString(),
          },
        ],
      }),
    },
  });

  await db.tradeOpportunityMessagingPolicy.upsert({
    where: { tradeOpportunityId: tradeOpportunity.id },
    update: {
      requireHumanApprovalBeforeSend: true,
      notes: `Fake scenario policy: ${input.scenarioLabel}.`,
      allowedMessageTypes: ['INTERNAL_SUMMARY'],
    },
    create: {
      id: `${input.id}-policy`,
      tradeOpportunityId: tradeOpportunity.id,
      requireHumanApprovalBeforeSend: true,
      notes: `Fake scenario policy: ${input.scenarioLabel}.`,
      allowedMessageTypes: ['INTERNAL_SUMMARY'],
    },
  });

  await db.tradeOpportunityEvent.upsert({
    where: { id: `${input.id}-created-event` },
    update: {
      newStatus: input.isActionable ? 'OPEN' : 'ON_HOLD',
      newStage: input.stage,
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: `Fake scenario trade opportunity: ${input.scenarioLabel}.`,
      metadata: demoMetadata({
        scenarioKey: input.scenarioKey,
        scenarioLabel: input.scenarioLabel,
      }),
    },
    create: {
      id: `${input.id}-created-event`,
      tradeOpportunityId: tradeOpportunity.id,
      actionType: 'CREATED',
      previousStatus: null,
      newStatus: input.isActionable ? 'OPEN' : 'ON_HOLD',
      previousStage: null,
      newStage: input.stage,
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: `Fake scenario trade opportunity: ${input.scenarioLabel}.`,
      metadata: demoMetadata({
        scenarioKey: input.scenarioKey,
        scenarioLabel: input.scenarioLabel,
      }),
    },
  });

  return tradeOpportunity;
}

async function upsertCommercialContext(input: {
  supplierId: string;
  customerId: string;
  completedProductId: string;
  completedOfferId: string;
  completedWorkflowId: string;
}) {
  await db.salesRecord.upsert({
    where: { id: 'demo-pilot-sales-cetirizine' },
    update: {
      saleDate: fixture.commercial.saleDate,
      customerId: input.customerId,
      productId: input.completedProductId,
      supplierId: input.supplierId,
      quantity: 360,
      unitPrice: new Prisma.Decimal('2.65'),
      totalRevenue: new Prisma.Decimal('954.00'),
      currencyCode: 'GBP',
      rawRow: demoMetadata({ source: 'fake sales history row' }),
    },
    create: {
      id: 'demo-pilot-sales-cetirizine',
      saleDate: fixture.commercial.saleDate,
      customerId: input.customerId,
      productId: input.completedProductId,
      supplierId: input.supplierId,
      rawProductName: fixture.products.completed.name,
      rawCustomerName: fixture.customer.name,
      rawSupplierName: fixture.supplier.name,
      normalizedProductName: fixture.products.completed.normalizedName,
      candidateStrength: fixture.products.completed.strength,
      candidateFormulation: fixture.products.completed.dosageForm,
      candidatePackSize: fixture.products.completed.packSize,
      quantity: 360,
      unitPrice: new Prisma.Decimal('2.65'),
      totalRevenue: new Prisma.Decimal('954.00'),
      currencyCode: 'GBP',
      rawRow: demoMetadata({ source: 'fake sales history row' }),
    },
  });

  await db.inventorySnapshot.upsert({
    where: { id: 'demo-pilot-inventory-cetirizine' },
    update: {
      productId: input.completedProductId,
      supplierId: input.supplierId,
      snapshotDate: fixture.commercial.snapshotDate,
      quantityOnHand: 80,
      quantityReserved: 20,
      quantityAvailable: 60,
      unitCost: new Prisma.Decimal('1.70'),
      totalValue: new Prisma.Decimal('136.00'),
      rawRow: demoMetadata({ source: 'fake inventory row' }),
    },
    create: {
      id: 'demo-pilot-inventory-cetirizine',
      productId: input.completedProductId,
      supplierId: input.supplierId,
      rawProductName: fixture.products.completed.name,
      rawSupplierName: fixture.supplier.name,
      normalizedProductName: fixture.products.completed.normalizedName,
      candidateStrength: fixture.products.completed.strength,
      candidateFormulation: fixture.products.completed.dosageForm,
      candidatePackSize: fixture.products.completed.packSize,
      warehouseCode: 'DEMO',
      snapshotDate: fixture.commercial.snapshotDate,
      quantityOnHand: 80,
      quantityReserved: 20,
      quantityAvailable: 60,
      unitCost: new Prisma.Decimal('1.70'),
      totalValue: new Prisma.Decimal('136.00'),
      rawRow: demoMetadata({ source: 'fake inventory row' }),
    },
  });

  await db.opportunity.upsert({
    where: { id: 'demo-pilot-buy-opportunity-cetirizine' },
    update: {
      type: 'BUY',
      status: 'OPEN',
      title: 'FAKE DEMO buy Cetirizine from demo supplier',
      description:
        'Fake demo: supplier quote is below recent demo sales price and has recent demand.',
      score: 91,
      customerId: input.customerId,
      productId: input.completedProductId,
      supplierId: input.supplierId,
      ownerUserId: fixture.user.id,
      dueDate: fixture.commercial.expectedDeliveryDate,
      metadata: demoMetadata(),
    },
    create: {
      id: 'demo-pilot-buy-opportunity-cetirizine',
      type: 'BUY',
      status: 'OPEN',
      title: 'FAKE DEMO buy Cetirizine from demo supplier',
      description:
        'Fake demo: supplier quote is below recent demo sales price and has recent demand.',
      score: 91,
      customerId: input.customerId,
      productId: input.completedProductId,
      supplierId: input.supplierId,
      ownerUserId: fixture.user.id,
      dueDate: fixture.commercial.expectedDeliveryDate,
      metadata: demoMetadata(),
    },
  });

  const buyDecision = await db.buyDecision.upsert({
    where: { emailDerivedOfferId: input.completedOfferId },
    update: {
      offerWorkflowItemId: input.completedWorkflowId,
      inboundEmailId: fixture.inboundEmail.id,
      supplierId: input.supplierId,
      productId: input.completedProductId,
      rawProductText: fixture.offers.completed.rawProductText,
      normalizedProductNameCandidate:
        fixture.offers.completed.normalizedProductNameCandidate,
      manufacturerCandidate: fixture.offers.completed.manufacturerCandidate,
      quotedUnitPrice: new Prisma.Decimal(
        fixture.offers.completed.priceCandidate,
      ),
      quotedCurrencyCode: fixture.offers.completed.currencyCandidate,
      quotedMinimumOrderQuantity:
        fixture.offers.completed.minimumOrderQuantityCandidate,
      quotedAvailability: fixture.offers.completed.availabilityCandidate,
      sourceKind: 'EMAIL_BODY',
      sourceBlockText: fixture.inboundEmail.rawText,
      supplierQualificationStatus: 'APPROVED',
      hasQualificationRisk: false,
      qualificationRiskNote: null,
      approvalStatus: 'APPROVED',
      approvalNote: 'Fake demo approval for pilot walkthrough.',
      approvedByType: fixture.actor.actorType,
      approvedByIdentifier: fixture.actor.actorIdentifier,
      approvedAt: fixture.commercial.approvedAt,
      orderStatus: 'ORDERED',
      orderedAt: fixture.commercial.orderedAt,
      externalOrderReference: fixture.commercial.externalOrderReference,
      metadata: demoMetadata(),
    },
    create: {
      id: 'demo-pilot-buy-decision-cetirizine',
      emailDerivedOfferId: input.completedOfferId,
      offerWorkflowItemId: input.completedWorkflowId,
      inboundEmailId: fixture.inboundEmail.id,
      supplierId: input.supplierId,
      productId: input.completedProductId,
      rawProductText: fixture.offers.completed.rawProductText,
      normalizedProductNameCandidate:
        fixture.offers.completed.normalizedProductNameCandidate,
      manufacturerCandidate: fixture.offers.completed.manufacturerCandidate,
      quotedUnitPrice: new Prisma.Decimal(
        fixture.offers.completed.priceCandidate,
      ),
      quotedCurrencyCode: fixture.offers.completed.currencyCandidate,
      quotedMinimumOrderQuantity:
        fixture.offers.completed.minimumOrderQuantityCandidate,
      quotedAvailability: fixture.offers.completed.availabilityCandidate,
      sourceKind: 'EMAIL_BODY',
      sourceBlockText: fixture.inboundEmail.rawText,
      supplierQualificationStatus: 'APPROVED',
      hasQualificationRisk: false,
      qualificationRiskNote: null,
      approvalStatus: 'APPROVED',
      approvalNote: 'Fake demo approval for pilot walkthrough.',
      approvedByType: fixture.actor.actorType,
      approvedByIdentifier: fixture.actor.actorIdentifier,
      approvedAt: fixture.commercial.approvedAt,
      orderStatus: 'ORDERED',
      orderedAt: fixture.commercial.orderedAt,
      externalOrderReference: fixture.commercial.externalOrderReference,
      metadata: demoMetadata(),
    },
  });

  await db.buyDecisionEvent.upsert({
    where: { id: 'demo-pilot-buy-decision-created-event' },
    update: {
      newApprovalStatus: 'APPROVED',
      newOrderStatus: 'NOT_ORDERED',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: 'Fake demo buy decision approved.',
      metadata: demoMetadata(),
    },
    create: {
      id: 'demo-pilot-buy-decision-created-event',
      buyDecisionId: buyDecision.id,
      actionType: 'CREATED',
      previousApprovalStatus: null,
      newApprovalStatus: 'APPROVED',
      previousOrderStatus: null,
      newOrderStatus: 'NOT_ORDERED',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: 'Fake demo buy decision approved.',
      metadata: demoMetadata(),
    },
  });

  await db.buyDecisionEvent.upsert({
    where: { id: 'demo-pilot-buy-decision-ordered-event' },
    update: {
      previousOrderStatus: 'NOT_ORDERED',
      newOrderStatus: 'ORDERED',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: 'Fake demo order reference added.',
      metadata: demoMetadata({
        externalOrderReference: fixture.commercial.externalOrderReference,
      }),
    },
    create: {
      id: 'demo-pilot-buy-decision-ordered-event',
      buyDecisionId: buyDecision.id,
      actionType: 'MARKED_ORDERED',
      previousApprovalStatus: 'APPROVED',
      newApprovalStatus: 'APPROVED',
      previousOrderStatus: 'NOT_ORDERED',
      newOrderStatus: 'ORDERED',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: 'Fake demo order reference added.',
      metadata: demoMetadata({
        externalOrderReference: fixture.commercial.externalOrderReference,
      }),
    },
  });

  const execution = await db.buyExecution.upsert({
    where: { buyDecisionId: buyDecision.id },
    update: {
      supplierId: input.supplierId,
      productId: input.completedProductId,
      orderedQuantity: 240,
      orderedUnitPrice: new Prisma.Decimal('1.85'),
      orderedCurrencyCode: 'GBP',
      orderedMinimumOrderQuantity: 240,
      confirmedAvailability: true,
      externalOrderReference: fixture.commercial.externalOrderReference,
      orderPlacedAt: fixture.commercial.orderedAt,
      orderConfirmedAt: fixture.commercial.confirmedAt,
      expectedDeliveryDate: fixture.commercial.expectedDeliveryDate,
      receivedQuantity: null,
      receivedAt: null,
      invoicedUnitPrice: null,
      invoicedCurrencyCode: 'GBP',
      invoiceReference: null,
      invoicedAt: null,
      fulfillmentStatus: 'ORDER_CONFIRMED',
      reconciliationStatus: 'MATCHED',
      hasPriceDrift: false,
      hasQuantityDrift: false,
      hasCurrencyMismatch: false,
      hasAvailabilityDrift: false,
      notes: 'Fake demo execution awaiting receipt.',
      metadata: demoMetadata(),
    },
    create: {
      id: 'demo-pilot-buy-execution-cetirizine',
      buyDecisionId: buyDecision.id,
      supplierId: input.supplierId,
      productId: input.completedProductId,
      orderedQuantity: 240,
      orderedUnitPrice: new Prisma.Decimal('1.85'),
      orderedCurrencyCode: 'GBP',
      orderedMinimumOrderQuantity: 240,
      confirmedAvailability: true,
      externalOrderReference: fixture.commercial.externalOrderReference,
      orderPlacedAt: fixture.commercial.orderedAt,
      orderConfirmedAt: fixture.commercial.confirmedAt,
      expectedDeliveryDate: fixture.commercial.expectedDeliveryDate,
      invoicedCurrencyCode: 'GBP',
      fulfillmentStatus: 'ORDER_CONFIRMED',
      reconciliationStatus: 'MATCHED',
      hasPriceDrift: false,
      hasQuantityDrift: false,
      hasCurrencyMismatch: false,
      hasAvailabilityDrift: false,
      notes: 'Fake demo execution awaiting receipt.',
      metadata: demoMetadata(),
    },
  });

  await db.buyExecutionEvent.upsert({
    where: { id: 'demo-pilot-buy-execution-confirmed-event' },
    update: {
      newFulfillmentStatus: 'ORDER_CONFIRMED',
      newReconciliationStatus: 'MATCHED',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: 'Fake demo supplier confirmed order.',
      metadata: demoMetadata(),
    },
    create: {
      id: 'demo-pilot-buy-execution-confirmed-event',
      buyExecutionId: execution.id,
      actionType: 'ORDER_CONFIRMED',
      previousFulfillmentStatus: 'ORDER_PLACED',
      newFulfillmentStatus: 'ORDER_CONFIRMED',
      previousReconciliationStatus: 'NOT_RECONCILED',
      newReconciliationStatus: 'MATCHED',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: 'Fake demo supplier confirmed order.',
      metadata: demoMetadata(),
    },
  });

  const tradeOpportunity = await db.tradeOpportunity.upsert({
    where: { id: 'demo-pilot-trade-opportunity-cetirizine' },
    update: {
      status: 'OPEN',
      stage: 'BUY_ORDERED',
      sourceType: 'BUY_DECISION',
      emailDerivedOfferId: input.completedOfferId,
      offerWorkflowItemId: input.completedWorkflowId,
      inboundEmailId: fixture.inboundEmail.id,
      buyDecisionId: buyDecision.id,
      buyExecutionId: execution.id,
      supplierId: input.supplierId,
      productId: input.completedProductId,
      ownerUserId: fixture.user.id,
      rawProductText: fixture.offers.completed.rawProductText,
      normalizedProductNameCandidate:
        fixture.offers.completed.normalizedProductNameCandidate,
      manufacturerCandidate: fixture.offers.completed.manufacturerCandidate,
      sourceSupplierNameSnapshot: fixture.supplier.name,
      targetBuyerNameSnapshot: fixture.customer.name,
      targetBuyerCompanySnapshot: fixture.customer.legalEntityName,
      supplierQualificationStatusSnapshot: 'APPROVED',
      quotedBuyUnitPrice: new Prisma.Decimal('1.85'),
      quotedBuyCurrencyCode: 'GBP',
      quotedBuyMinimumOrderQuantity: 240,
      quotedAvailability: 'Available now',
      targetSellUnitPrice: new Prisma.Decimal('2.65'),
      targetSellCurrencyCode: 'GBP',
      minimumMarginAmount: new Prisma.Decimal('0.25'),
      minimumMarginPct: new Prisma.Decimal('0.1000'),
      estimatedMarginAmount: new Prisma.Decimal('0.80'),
      estimatedMarginPct: new Prisma.Decimal('0.3019'),
      quantityTarget: 240,
      rationale:
        'Fake demo deal: recent demand and positive spread after operator approval.',
      riskFlags: [],
      hasQualificationBlock: false,
      isMarginFloorMet: true,
      isActionable: true,
      hasMessagingPolicyViolations: false,
      messagingPolicyViolationCount: 0,
      ownerLabel: 'Demo operator',
      createdByType: fixture.actor.actorType,
      createdByIdentifier: fixture.actor.actorIdentifier,
      metadata: demoMetadata({
        createdFrom: 'demo-pilot-seed',
        recentDemandWindowDays: 30,
        recentUnitsSold: 360,
        recentAverageSalePrice: 2.65,
        likelyBuyers: [
          {
            customerId: input.customerId,
            name: fixture.customer.name,
            units: 360,
            orderCount: 1,
            lastSaleAt: fixture.commercial.saleDate.toISOString(),
          },
        ],
      }),
    },
    create: {
      id: 'demo-pilot-trade-opportunity-cetirizine',
      status: 'OPEN',
      stage: 'BUY_ORDERED',
      sourceType: 'BUY_DECISION',
      emailDerivedOfferId: input.completedOfferId,
      offerWorkflowItemId: input.completedWorkflowId,
      inboundEmailId: fixture.inboundEmail.id,
      buyDecisionId: buyDecision.id,
      buyExecutionId: execution.id,
      supplierId: input.supplierId,
      productId: input.completedProductId,
      ownerUserId: fixture.user.id,
      rawProductText: fixture.offers.completed.rawProductText,
      normalizedProductNameCandidate:
        fixture.offers.completed.normalizedProductNameCandidate,
      manufacturerCandidate: fixture.offers.completed.manufacturerCandidate,
      sourceSupplierNameSnapshot: fixture.supplier.name,
      targetBuyerNameSnapshot: fixture.customer.name,
      targetBuyerCompanySnapshot: fixture.customer.legalEntityName,
      supplierQualificationStatusSnapshot: 'APPROVED',
      quotedBuyUnitPrice: new Prisma.Decimal('1.85'),
      quotedBuyCurrencyCode: 'GBP',
      quotedBuyMinimumOrderQuantity: 240,
      quotedAvailability: 'Available now',
      targetSellUnitPrice: new Prisma.Decimal('2.65'),
      targetSellCurrencyCode: 'GBP',
      minimumMarginAmount: new Prisma.Decimal('0.25'),
      minimumMarginPct: new Prisma.Decimal('0.1000'),
      estimatedMarginAmount: new Prisma.Decimal('0.80'),
      estimatedMarginPct: new Prisma.Decimal('0.3019'),
      quantityTarget: 240,
      rationale:
        'Fake demo deal: recent demand and positive spread after operator approval.',
      riskFlags: [],
      hasQualificationBlock: false,
      isMarginFloorMet: true,
      isActionable: true,
      hasMessagingPolicyViolations: false,
      messagingPolicyViolationCount: 0,
      ownerLabel: 'Demo operator',
      createdByType: fixture.actor.actorType,
      createdByIdentifier: fixture.actor.actorIdentifier,
      metadata: demoMetadata({
        createdFrom: 'demo-pilot-seed',
        recentDemandWindowDays: 30,
        recentUnitsSold: 360,
        recentAverageSalePrice: 2.65,
        likelyBuyers: [
          {
            customerId: input.customerId,
            name: fixture.customer.name,
            units: 360,
            orderCount: 1,
            lastSaleAt: fixture.commercial.saleDate.toISOString(),
          },
        ],
      }),
    },
  });

  await db.tradeOpportunityMessagingPolicy.upsert({
    where: { tradeOpportunityId: tradeOpportunity.id },
    update: {
      requireHumanApprovalBeforeSend: true,
      notes: 'Fake demo policy. Human approval required before any send.',
      allowedMessageTypes: ['INTERNAL_SUMMARY', 'INITIAL_BUYER_OFFER'],
    },
    create: {
      id: 'demo-pilot-trade-opportunity-policy',
      tradeOpportunityId: tradeOpportunity.id,
      requireHumanApprovalBeforeSend: true,
      notes: 'Fake demo policy. Human approval required before any send.',
      allowedMessageTypes: ['INTERNAL_SUMMARY', 'INITIAL_BUYER_OFFER'],
    },
  });

  await db.tradeOpportunityEvent.upsert({
    where: { id: 'demo-pilot-trade-opportunity-created-event' },
    update: {
      newStatus: 'OPEN',
      newStage: 'BUY_ORDERED',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: 'Fake demo trade opportunity created from approved buy decision.',
      metadata: demoMetadata(),
    },
    create: {
      id: 'demo-pilot-trade-opportunity-created-event',
      tradeOpportunityId: tradeOpportunity.id,
      actionType: 'CREATED',
      previousStatus: null,
      newStatus: 'OPEN',
      previousStage: null,
      newStage: 'BUY_ORDERED',
      actorType: fixture.actor.actorType,
      actorIdentifier: fixture.actor.actorIdentifier,
      note: 'Fake demo trade opportunity created from approved buy decision.',
      metadata: demoMetadata(),
    },
  });

  return {
    buyDecision,
    execution,
    tradeOpportunity,
  };
}

async function upsertPilotScenarioMatrix(input: {
  customerId: string;
}): Promise<{
  scenarioWorkflowIds: string[];
  scenarioTradeOpportunityIds: string[];
  scenarioOpportunityIds: string[];
}> {
  const scenarios: PilotScenarioSeedInput[] = [
    {
      key: 'clean-offer',
      label: 'Clean supplier offer ready for review',
      receivedOffsetMinutes: 10,
      product: {
        id: 'demo-pilot-product-clean-offer',
        sku: 'DEMO-CLEAN-001',
        name: 'Fake Clean Offer Tablets 10mg 30',
        normalizedName: 'fake clean offer tablets 10mg 30',
        manufacturer: 'Demo Generics Ltd',
        strength: '10mg',
        dosageForm: 'Tablet',
        packSize: '30 tablets',
        aliasName: 'CleanTab 10mg 30',
      },
      supplier: {
        id: 'demo-pilot-supplier-clean-offer',
        name: 'Clean Scenario Supplier Ltd',
        normalizedName: 'clean scenario supplier ltd',
        country: 'GB',
        contactEmail: 'clean-scenario@fake-pilot.example.test',
        qualificationStatus: 'APPROVED',
        qualificationNote: 'Fake scenario approved supplier.',
      },
      offer: {
        id: 'demo-pilot-offer-clean-offer',
        offerFingerprint: 'demo-pilot-offer-clean-offer-v1',
        rawProductText: 'Fake Clean Offer Tablets 10mg 30',
        normalizedProductNameCandidate: 'fake clean offer tablets 10mg 30',
        strengthCandidate: '10mg',
        dosageFormCandidate: 'Tablet',
        packSizeCandidate: '30 tablets',
        manufacturerCandidate: 'Demo Generics Ltd',
        supplierCandidate: 'Clean Scenario Supplier Ltd',
        priceCandidate: '4.20',
        currencyCandidate: 'GBP',
        minimumOrderQuantityCandidate: 60,
        availabilityCandidate: 'Available now',
        reviewReason: 'ready_to_approve',
      },
      workflow: {
        id: 'demo-pilot-workflow-clean-offer',
        status: 'NEW',
        note: 'Clean supplier offer ready for review.',
        priority: 'HIGH',
      },
    },
    {
      key: 'ambiguous-supplier',
      label: 'Ambiguous supplier',
      receivedOffsetMinutes: 20,
      product: {
        id: 'demo-pilot-product-ambiguous-supplier',
        sku: 'DEMO-AMB-001',
        name: 'Fake Ambiguous Supplier Capsules 20mg 28',
        normalizedName: 'fake ambiguous supplier capsules 20mg 28',
        manufacturer: 'Demo Generics Ltd',
        strength: '20mg',
        dosageForm: 'Capsule',
        packSize: '28 capsules',
        aliasName: 'AmbiCap 20mg 28',
      },
      offer: {
        id: 'demo-pilot-offer-ambiguous-supplier',
        offerFingerprint: 'demo-pilot-offer-ambiguous-supplier-v1',
        rawProductText: 'Fake Ambiguous Supplier Capsules 20mg 28',
        normalizedProductNameCandidate:
          'fake ambiguous supplier capsules 20mg 28',
        strengthCandidate: '20mg',
        dosageFormCandidate: 'Capsule',
        packSizeCandidate: '28 capsules',
        manufacturerCandidate: 'Demo Generics Ltd',
        supplierCandidate: 'Two possible fake suppliers',
        priceCandidate: '5.10',
        currencyCandidate: 'GBP',
        minimumOrderQuantityCandidate: 80,
        availabilityCandidate: 'Available this week',
        reviewReason: 'unresolved_supplier',
      },
      workflow: {
        id: 'demo-pilot-workflow-ambiguous-supplier',
        status: 'NEEDS_INFO',
        note: 'Ambiguous supplier needs operator confirmation.',
        priority: 'HIGH',
        hasUnresolvedSupplier: true,
        hasConflictingSupplierCues: true,
        supplierQualificationStatus: 'UNKNOWN',
        hasUnknownSupplierQualification: true,
        qualificationRiskNote:
          'Fake scenario supplier identity is unresolved before approval.',
      },
      supplierResolutionConfidence: 32,
    },
    {
      key: 'blocked-supplier',
      label: 'Blocked or restricted supplier',
      receivedOffsetMinutes: 30,
      product: {
        id: 'demo-pilot-product-blocked-supplier',
        sku: 'DEMO-BLOCK-001',
        name: 'Fake Blocked Supplier Oral Solution 5mg 100ml',
        normalizedName: 'fake blocked supplier oral solution 5mg 100ml',
        manufacturer: 'Demo Generics Ltd',
        strength: '5mg',
        dosageForm: 'Oral solution',
        packSize: '100ml',
        aliasName: 'BlockSol 5mg 100ml',
      },
      supplier: {
        id: 'demo-pilot-supplier-blocked',
        name: 'Blocked Scenario Supplier Ltd',
        normalizedName: 'blocked scenario supplier ltd',
        country: 'GB',
        contactEmail: 'blocked-scenario@fake-pilot.example.test',
        qualificationStatus: 'BLOCKED',
        qualificationNote: 'Fake scenario blocked supplier.',
      },
      offer: {
        id: 'demo-pilot-offer-blocked-supplier',
        offerFingerprint: 'demo-pilot-offer-blocked-supplier-v1',
        rawProductText: 'Fake Blocked Supplier Oral Solution 5mg 100ml',
        normalizedProductNameCandidate:
          'fake blocked supplier oral solution 5mg 100ml',
        strengthCandidate: '5mg',
        dosageFormCandidate: 'Oral solution',
        packSizeCandidate: '100ml',
        manufacturerCandidate: 'Demo Generics Ltd',
        supplierCandidate: 'Blocked Scenario Supplier Ltd',
        priceCandidate: '3.40',
        currencyCandidate: 'GBP',
        minimumOrderQuantityCandidate: 50,
        availabilityCandidate: 'Available now',
        reviewReason: 'blocked_supplier',
      },
      workflow: {
        id: 'demo-pilot-workflow-blocked-supplier',
        status: 'NEEDS_INFO',
        note: 'Blocked supplier must not be approved.',
        priority: 'HIGH',
        supplierQualificationStatus: 'BLOCKED',
        hasBlockedSupplier: true,
        qualificationRiskNote:
          'Blocked supplier in fake scenario; approval is intentionally blocked.',
      },
    },
    {
      key: 'stale-correction',
      label: 'Stale correction after approval',
      receivedOffsetMinutes: 40,
      product: {
        id: 'demo-pilot-product-stale-correction',
        sku: 'DEMO-STALE-001',
        name: 'Fake Stale Correction Tablets 2mg 60',
        normalizedName: 'fake stale correction tablets 2mg 60',
        manufacturer: 'Demo Generics Ltd',
        strength: '2mg',
        dosageForm: 'Tablet',
        packSize: '60 tablets',
        aliasName: 'StaleTab 2mg 60',
      },
      supplier: {
        id: 'demo-pilot-supplier-stale-correction',
        name: 'Stale Correction Scenario Supplier Ltd',
        normalizedName: 'stale correction scenario supplier ltd',
        country: 'GB',
        contactEmail: 'stale-correction@fake-pilot.example.test',
        qualificationStatus: 'APPROVED',
        qualificationNote: 'Fake scenario approved supplier.',
      },
      offer: {
        id: 'demo-pilot-offer-stale-correction',
        offerFingerprint: 'demo-pilot-offer-stale-correction-v1',
        rawProductText: 'Fake Stale Correction Tablets 2mg 60',
        normalizedProductNameCandidate: 'fake stale correction tablets 2mg 60',
        strengthCandidate: '2mg',
        dosageFormCandidate: 'Tablet',
        packSizeCandidate: '60 tablets',
        manufacturerCandidate: 'Demo Generics Ltd',
        supplierCandidate: 'Stale Correction Scenario Supplier Ltd',
        priceCandidate: '6.75',
        currencyCandidate: 'GBP',
        minimumOrderQuantityCandidate: 40,
        availabilityCandidate: 'Available now',
        reviewReason: 'stale_correction_after_approval',
      },
      workflow: {
        id: 'demo-pilot-workflow-stale-correction',
        status: 'NEEDS_INFO',
        note: 'Stale correction after approval needs re-review.',
        priority: 'HIGH',
      },
    },
    {
      key: 'missing-terms',
      label: 'Missing price or currency',
      receivedOffsetMinutes: 50,
      product: {
        id: 'demo-pilot-product-missing-terms',
        sku: 'DEMO-MISS-001',
        name: 'Fake Missing Terms Suspension 125mg 100ml',
        normalizedName: 'fake missing terms suspension 125mg 100ml',
        manufacturer: 'Demo Generics Ltd',
        strength: '125mg',
        dosageForm: 'Suspension',
        packSize: '100ml',
        aliasName: 'MissingSusp 125mg 100ml',
      },
      supplier: {
        id: 'demo-pilot-supplier-missing-terms',
        name: 'Missing Terms Scenario Supplier Ltd',
        normalizedName: 'missing terms scenario supplier ltd',
        country: 'GB',
        contactEmail: 'missing-terms@fake-pilot.example.test',
        qualificationStatus: 'APPROVED',
        qualificationNote: 'Fake scenario approved supplier.',
      },
      offer: {
        id: 'demo-pilot-offer-missing-terms',
        offerFingerprint: 'demo-pilot-offer-missing-terms-v1',
        rawProductText: 'Fake Missing Terms Suspension 125mg 100ml',
        normalizedProductNameCandidate:
          'fake missing terms suspension 125mg 100ml',
        strengthCandidate: '125mg',
        dosageFormCandidate: 'Suspension',
        packSizeCandidate: '100ml',
        manufacturerCandidate: 'Demo Generics Ltd',
        supplierCandidate: 'Missing Terms Scenario Supplier Ltd',
        priceCandidate: null,
        currencyCandidate: null,
        minimumOrderQuantityCandidate: 24,
        availabilityCandidate: 'Available now',
        reviewReason: 'missing_price',
      },
      workflow: {
        id: 'demo-pilot-workflow-missing-terms',
        status: 'NEEDS_INFO',
        note: 'Missing price or currency before approval.',
        priority: 'HIGH',
      },
      fieldConfidence: 42,
    },
    {
      key: 'high-moq',
      label: 'High MOQ',
      receivedOffsetMinutes: 60,
      product: {
        id: 'demo-pilot-product-high-moq',
        sku: 'DEMO-MOQ-001',
        name: 'Fake High MOQ Tablets 1mg 100',
        normalizedName: 'fake high moq tablets 1mg 100',
        manufacturer: 'Demo Generics Ltd',
        strength: '1mg',
        dosageForm: 'Tablet',
        packSize: '100 tablets',
        aliasName: 'MoqTab 1mg 100',
      },
      supplier: {
        id: 'demo-pilot-supplier-high-moq',
        name: 'High MOQ Scenario Supplier Ltd',
        normalizedName: 'high moq scenario supplier ltd',
        country: 'GB',
        contactEmail: 'high-moq@fake-pilot.example.test',
        qualificationStatus: 'APPROVED',
        qualificationNote: 'Fake scenario approved supplier.',
      },
      offer: {
        id: 'demo-pilot-offer-high-moq',
        offerFingerprint: 'demo-pilot-offer-high-moq-v1',
        rawProductText: 'Fake High MOQ Tablets 1mg 100',
        normalizedProductNameCandidate: 'fake high moq tablets 1mg 100',
        strengthCandidate: '1mg',
        dosageFormCandidate: 'Tablet',
        packSizeCandidate: '100 tablets',
        manufacturerCandidate: 'Demo Generics Ltd',
        supplierCandidate: 'High MOQ Scenario Supplier Ltd',
        priceCandidate: '1.20',
        currencyCandidate: 'GBP',
        minimumOrderQuantityCandidate: 10000,
        availabilityCandidate: 'Available now; MOQ 10000',
        reviewReason: 'high_moq',
      },
      workflow: {
        id: 'demo-pilot-workflow-high-moq',
        status: 'NEW',
        note: 'High MOQ requires operator review.',
        priority: 'MEDIUM',
      },
    },
    {
      key: 'low-margin',
      label: 'Low margin',
      receivedOffsetMinutes: 70,
      product: {
        id: 'demo-pilot-product-low-margin',
        sku: 'DEMO-MARGIN-001',
        name: 'Fake Low Margin Capsules 50mg 28',
        normalizedName: 'fake low margin capsules 50mg 28',
        manufacturer: 'Demo Generics Ltd',
        strength: '50mg',
        dosageForm: 'Capsule',
        packSize: '28 capsules',
        aliasName: 'MarginCap 50mg 28',
      },
      supplier: {
        id: 'demo-pilot-supplier-low-margin',
        name: 'Low Margin Scenario Supplier Ltd',
        normalizedName: 'low margin scenario supplier ltd',
        country: 'GB',
        contactEmail: 'low-margin@fake-pilot.example.test',
        qualificationStatus: 'APPROVED',
        qualificationNote: 'Fake scenario approved supplier.',
      },
      offer: {
        id: 'demo-pilot-offer-low-margin',
        offerFingerprint: 'demo-pilot-offer-low-margin-v1',
        rawProductText: 'Fake Low Margin Capsules 50mg 28',
        normalizedProductNameCandidate: 'fake low margin capsules 50mg 28',
        strengthCandidate: '50mg',
        dosageFormCandidate: 'Capsule',
        packSizeCandidate: '28 capsules',
        manufacturerCandidate: 'Demo Generics Ltd',
        supplierCandidate: 'Low Margin Scenario Supplier Ltd',
        priceCandidate: '9.90',
        currencyCandidate: 'GBP',
        minimumOrderQuantityCandidate: 120,
        availabilityCandidate: 'Available now',
        reviewReason: 'low_margin',
      },
      workflow: {
        id: 'demo-pilot-workflow-low-margin',
        status: 'NEW',
        note: 'Low margin scenario requires operator judgement.',
        priority: 'MEDIUM',
      },
    },
    {
      key: 'near-expiry',
      label: 'Near-expiry or expired stock',
      receivedOffsetMinutes: 80,
      product: {
        id: 'demo-pilot-product-near-expiry',
        sku: 'DEMO-EXP-001',
        name: 'Fake Near Expiry Injection 10mg 5 ampoules',
        normalizedName: 'fake near expiry injection 10mg 5 ampoules',
        manufacturer: 'Demo Generics Ltd',
        strength: '10mg',
        dosageForm: 'Injection',
        packSize: '5 ampoules',
        aliasName: 'ExpiryInj 10mg 5',
      },
      supplier: {
        id: 'demo-pilot-supplier-near-expiry',
        name: 'Near Expiry Scenario Supplier Ltd',
        normalizedName: 'near expiry scenario supplier ltd',
        country: 'GB',
        contactEmail: 'near-expiry@fake-pilot.example.test',
        qualificationStatus: 'APPROVED',
        qualificationNote: 'Fake scenario approved supplier.',
      },
      offer: {
        id: 'demo-pilot-offer-near-expiry',
        offerFingerprint: 'demo-pilot-offer-near-expiry-v1',
        rawProductText: 'Fake Near Expiry Injection 10mg 5 ampoules',
        normalizedProductNameCandidate:
          'fake near expiry injection 10mg 5 ampoules',
        strengthCandidate: '10mg',
        dosageFormCandidate: 'Injection',
        packSizeCandidate: '5 ampoules',
        manufacturerCandidate: 'Demo Generics Ltd',
        supplierCandidate: 'Near Expiry Scenario Supplier Ltd',
        priceCandidate: '11.50',
        currencyCandidate: 'GBP',
        minimumOrderQuantityCandidate: 25,
        availabilityCandidate: 'Available now; near-expiry demo stock',
        reviewReason: 'near_expiry_stock',
      },
      workflow: {
        id: 'demo-pilot-workflow-near-expiry',
        status: 'NEW',
        note: 'Near-expiry or expired stock needs careful review.',
        priority: 'HIGH',
      },
    },
    {
      key: 'dead-stock',
      label: 'Dead stock push opportunity',
      receivedOffsetMinutes: 90,
      product: {
        id: 'demo-pilot-product-dead-stock',
        sku: 'DEMO-DEAD-001',
        name: 'Fake Dead Stock Syrup 50mg 150ml',
        normalizedName: 'fake dead stock syrup 50mg 150ml',
        manufacturer: 'Demo Generics Ltd',
        strength: '50mg',
        dosageForm: 'Syrup',
        packSize: '150ml',
        aliasName: 'DeadStockSyrup 50mg 150ml',
      },
      supplier: {
        id: 'demo-pilot-supplier-dead-stock',
        name: 'Dead Stock Scenario Supplier Ltd',
        normalizedName: 'dead stock scenario supplier ltd',
        country: 'GB',
        contactEmail: 'dead-stock@fake-pilot.example.test',
        qualificationStatus: 'APPROVED',
        qualificationNote: 'Fake scenario approved supplier.',
      },
      offer: {
        id: 'demo-pilot-offer-dead-stock',
        offerFingerprint: 'demo-pilot-offer-dead-stock-v1',
        rawProductText: 'Fake Dead Stock Syrup 50mg 150ml',
        normalizedProductNameCandidate: 'fake dead stock syrup 50mg 150ml',
        strengthCandidate: '50mg',
        dosageFormCandidate: 'Syrup',
        packSizeCandidate: '150ml',
        manufacturerCandidate: 'Demo Generics Ltd',
        supplierCandidate: 'Dead Stock Scenario Supplier Ltd',
        priceCandidate: '2.25',
        currencyCandidate: 'GBP',
        minimumOrderQuantityCandidate: 12,
        availabilityCandidate: 'In warehouse; push opportunity',
        reviewReason: 'dead_stock_push',
      },
      workflow: {
        id: 'demo-pilot-workflow-dead-stock',
        status: 'NEW',
        note: 'Dead stock push opportunity requires operator review.',
        priority: 'MEDIUM',
      },
    },
  ];

  const seeded = new Map<
    string,
    Awaited<ReturnType<typeof upsertScenarioEmailOfferWorkflow>>
  >();

  for (const scenario of scenarios) {
    seeded.set(scenario.key, await upsertScenarioEmailOfferWorkflow(scenario));
  }

  const stale = seeded.get('stale-correction');
  if (stale) {
    await upsertScenarioBuyDecision({
      id: 'demo-pilot-buy-decision-stale-correction',
      scenarioKey: 'stale-correction',
      scenarioLabel: 'Stale correction after approval',
      offerId: stale.offer.id,
      workflowId: stale.workflow.id,
      inboundEmailId: stale.inboundEmail.id,
      supplierId: stale.supplier?.id ?? null,
      productId: stale.product.id,
      rawProductText: 'Fake Stale Correction Tablets 2mg 60',
      normalizedProductNameCandidate: 'fake stale correction tablets 2mg 60',
      manufacturerCandidate: 'Demo Generics Ltd',
      quotedUnitPrice: '6.75',
      quotedCurrencyCode: 'GBP',
      quotedMinimumOrderQuantity: 40,
      quotedAvailability: 'Available now',
      supplierQualificationStatus: 'APPROVED',
      hasQualificationRisk: false,
      qualificationRiskNote: null,
      approvalStatus: 'APPROVED',
    });
    await upsertSafeCorrection({
      workflowId: stale.workflow.id,
      offerId: stale.offer.id,
      inboundEmailId: stale.inboundEmail.id,
      correctedProductId: stale.product.id,
    });
  }

  const lowMargin = seeded.get('low-margin');
  const nearExpiry = seeded.get('near-expiry');
  const deadStock = seeded.get('dead-stock');
  const tradeOpportunityIds: string[] = [];
  const opportunityIds: string[] = [];

  if (lowMargin) {
    const tradeOpportunity = await upsertScenarioTradeOpportunity({
      id: 'demo-pilot-trade-opportunity-low-margin',
      scenarioKey: 'low-margin',
      scenarioLabel: 'Low margin',
      offerId: lowMargin.offer.id,
      workflowId: lowMargin.workflow.id,
      inboundEmailId: lowMargin.inboundEmail.id,
      supplierId: lowMargin.supplier?.id ?? null,
      productId: lowMargin.product.id,
      rawProductText: 'Fake Low Margin Capsules 50mg 28',
      normalizedProductNameCandidate: 'fake low margin capsules 50mg 28',
      supplierName: lowMargin.supplier?.name ?? null,
      quotedBuyUnitPrice: '9.90',
      quotedBuyCurrencyCode: 'GBP',
      targetSellUnitPrice: '10.05',
      targetSellCurrencyCode: 'GBP',
      estimatedMarginAmount: '0.15',
      estimatedMarginPct: '0.0149',
      quantityTarget: 120,
      stage: 'REVIEW',
      rationale: 'Fake scenario low margin; margin floor is not met.',
      riskFlags: ['margin_floor_not_met'],
      isMarginFloorMet: false,
      isActionable: false,
      recentUnitsSold: 80,
    });
    tradeOpportunityIds.push(tradeOpportunity.id);
  }

  if (nearExpiry) {
    await db.inventorySnapshot.upsert({
      where: { id: 'demo-pilot-inventory-near-expiry' },
      update: {
        productId: nearExpiry.product.id,
        supplierId: nearExpiry.supplier?.id ?? null,
        snapshotDate: fixture.commercial.snapshotDate,
        quantityOnHand: 90,
        quantityReserved: 5,
        quantityAvailable: 85,
        unitCost: new Prisma.Decimal('11.50'),
        totalValue: new Prisma.Decimal('1035.00'),
        rawRow: demoMetadata({
          scenarioKey: 'near-expiry',
          stockRisk: 'near-expiry fake stock',
        }),
      },
      create: {
        id: 'demo-pilot-inventory-near-expiry',
        productId: nearExpiry.product.id,
        supplierId: nearExpiry.supplier?.id ?? null,
        rawProductName: nearExpiry.product.name,
        rawSupplierName: nearExpiry.supplier?.name ?? null,
        normalizedProductName: 'fake near expiry injection 10mg 5 ampoules',
        candidateStrength: '10mg',
        candidateFormulation: 'Injection',
        candidatePackSize: '5 ampoules',
        warehouseCode: 'DEMO',
        snapshotDate: fixture.commercial.snapshotDate,
        quantityOnHand: 90,
        quantityReserved: 5,
        quantityAvailable: 85,
        unitCost: new Prisma.Decimal('11.50'),
        totalValue: new Prisma.Decimal('1035.00'),
        rawRow: demoMetadata({
          scenarioKey: 'near-expiry',
          stockRisk: 'near-expiry fake stock',
        }),
      },
    });

    const tradeOpportunity = await upsertScenarioTradeOpportunity({
      id: 'demo-pilot-trade-opportunity-near-expiry',
      scenarioKey: 'near-expiry',
      scenarioLabel: 'Near-expiry or expired stock',
      offerId: nearExpiry.offer.id,
      workflowId: nearExpiry.workflow.id,
      inboundEmailId: nearExpiry.inboundEmail.id,
      supplierId: nearExpiry.supplier?.id ?? null,
      productId: nearExpiry.product.id,
      rawProductText: 'Fake Near Expiry Injection 10mg 5 ampoules',
      normalizedProductNameCandidate:
        'fake near expiry injection 10mg 5 ampoules',
      supplierName: nearExpiry.supplier?.name ?? null,
      quotedBuyUnitPrice: '11.50',
      quotedBuyCurrencyCode: 'GBP',
      targetSellUnitPrice: '14.25',
      targetSellCurrencyCode: 'GBP',
      estimatedMarginAmount: '2.75',
      estimatedMarginPct: '0.1930',
      quantityTarget: 25,
      stage: 'REVIEW',
      rationale:
        'Fake scenario near-expiry or expired stock risk; operator must confirm shelf-life before action.',
      riskFlags: ['near_expiry_or_expired_stock'],
      isMarginFloorMet: true,
      isActionable: false,
      recentUnitsSold: 15,
    });
    tradeOpportunityIds.push(tradeOpportunity.id);
  }

  if (deadStock) {
    const opportunity = await db.opportunity.upsert({
      where: { id: 'demo-pilot-dead-stock-push-opportunity' },
      update: {
        type: 'DEAD_STOCK',
        status: 'OPEN',
        title: 'FAKE DEMO dead stock push opportunity',
        description:
          'Fake scenario: dead stock and push opportunity for operator review only.',
        score: 62,
        customerId: input.customerId,
        productId: deadStock.product.id,
        supplierId: deadStock.supplier?.id ?? null,
        ownerUserId: fixture.user.id,
        dueDate: fixture.commercial.expectedDeliveryDate,
        metadata: demoMetadata({
          scenarioKey: 'dead-stock',
          scenarioLabel: 'Dead stock push opportunity',
        }),
      },
      create: {
        id: 'demo-pilot-dead-stock-push-opportunity',
        type: 'DEAD_STOCK',
        status: 'OPEN',
        title: 'FAKE DEMO dead stock push opportunity',
        description:
          'Fake scenario: dead stock and push opportunity for operator review only.',
        score: 62,
        customerId: input.customerId,
        productId: deadStock.product.id,
        supplierId: deadStock.supplier?.id ?? null,
        ownerUserId: fixture.user.id,
        dueDate: fixture.commercial.expectedDeliveryDate,
        metadata: demoMetadata({
          scenarioKey: 'dead-stock',
          scenarioLabel: 'Dead stock push opportunity',
        }),
      },
    });
    opportunityIds.push(opportunity.id);

    const tradeOpportunity = await upsertScenarioTradeOpportunity({
      id: 'demo-pilot-trade-opportunity-dead-stock',
      scenarioKey: 'dead-stock',
      scenarioLabel: 'Dead stock push opportunity',
      offerId: deadStock.offer.id,
      workflowId: deadStock.workflow.id,
      inboundEmailId: deadStock.inboundEmail.id,
      supplierId: deadStock.supplier?.id ?? null,
      productId: deadStock.product.id,
      rawProductText: 'Fake Dead Stock Syrup 50mg 150ml',
      normalizedProductNameCandidate: 'fake dead stock syrup 50mg 150ml',
      supplierName: deadStock.supplier?.name ?? null,
      quotedBuyUnitPrice: '2.25',
      quotedBuyCurrencyCode: 'GBP',
      targetSellUnitPrice: '2.95',
      targetSellCurrencyCode: 'GBP',
      estimatedMarginAmount: '0.70',
      estimatedMarginPct: '0.2373',
      quantityTarget: 12,
      stage: 'READY_FOR_BUYER_OUTREACH',
      rationale:
        'Fake scenario dead stock / push opportunity; human approval still required before any outreach.',
      riskFlags: ['dead_stock_push_opportunity'],
      isMarginFloorMet: true,
      isActionable: true,
      recentUnitsSold: 0,
    });
    tradeOpportunityIds.push(tradeOpportunity.id);
  }

  return {
    scenarioWorkflowIds: Array.from(seeded.values()).map(
      (item) => item.workflow.id,
    ),
    scenarioTradeOpportunityIds: tradeOpportunityIds,
    scenarioOpportunityIds: opportunityIds,
  };
}

export function assertSafePilotDemoDatabase(databaseUrl: string) {
  const database = classifyDatabaseUrlForLocalSmoke(databaseUrl);

  if (!database.safe) {
    throw new Error(
      `Unsafe DATABASE_URL for pilot demo seed: ${database.reason}`,
    );
  }

  return database;
}

export async function seedPilotDemo() {
  const base = await upsertBaseRecords();
  const email = await upsertEmailAndOffers({
    supplierId: base.supplier.id,
    pendingProductId: base.pendingProduct.id,
    completedProductId: base.completedProduct.id,
  });
  const pendingWorkflow = await upsertWorkflow({
    workflowId: fixture.offers.pending.workflowId,
    offerId: email.pendingOffer.id,
    inboundEmailId: email.inboundEmail.id,
    status: 'NEW',
    note: fixture.offers.pending.reviewReason,
  });
  const completedWorkflow = await upsertWorkflow({
    workflowId: fixture.offers.completed.workflowId,
    offerId: email.completedOffer.id,
    inboundEmailId: email.inboundEmail.id,
    status: 'ORDERED',
    note: fixture.offers.completed.reviewReason,
    scenarioKey: 'already-ordered',
    scenarioLabel: 'Already ordered or executed item',
  });
  await upsertSafeCorrection({
    workflowId: pendingWorkflow.id,
    offerId: email.pendingOffer.id,
    inboundEmailId: email.inboundEmail.id,
    correctedProductId: base.pendingProduct.id,
  });
  const commercial = await upsertCommercialContext({
    supplierId: base.supplier.id,
    customerId: base.customer.id,
    completedProductId: base.completedProduct.id,
    completedOfferId: email.completedOffer.id,
    completedWorkflowId: completedWorkflow.id,
  });
  const scenarioMatrix = await upsertPilotScenarioMatrix({
    customerId: base.customer.id,
  });

  return {
    pendingWorkflowId: pendingWorkflow.id,
    completedWorkflowId: completedWorkflow.id,
    buyDecisionId: commercial.buyDecision.id,
    buyExecutionId: commercial.execution.id,
    tradeOpportunityId: commercial.tradeOpportunity.id,
    scenarioWorkflowIds: scenarioMatrix.scenarioWorkflowIds,
    scenarioTradeOpportunityIds: scenarioMatrix.scenarioTradeOpportunityIds,
    scenarioOpportunityIds: scenarioMatrix.scenarioOpportunityIds,
  };
}

async function run() {
  try {
    const database = assertSafePilotDemoDatabase(env.databaseUrl);
    const result = await seedPilotDemo();

    console.log('Fake pilot demo dataset seeded.');
    console.log(`Marker: ${PILOT_DEMO_MARKER}`);
    console.log(`Database host: ${database.host ?? 'unknown'}`);
    console.log(`Database name: ${database.databaseName ?? 'unknown'}`);
    console.log(`Pending review workflow: ${result.pendingWorkflowId}`);
    console.log(`Completed review workflow: ${result.completedWorkflowId}`);
    console.log(`Buy decision: ${result.buyDecisionId}`);
    console.log(`Buy execution: ${result.buyExecutionId}`);
    console.log(`Trade opportunity: ${result.tradeOpportunityId}`);
    console.log(`Scenario workflows: ${result.scenarioWorkflowIds.join(', ')}`);
    console.log(
      `Scenario trade opportunities: ${result.scenarioTradeOpportunityIds.join(', ')}`,
    );
    console.log(
      `Scenario opportunities: ${result.scenarioOpportunityIds.join(', ')}`,
    );
    console.log('External services called: false');
  } catch (error) {
    console.error('Fake pilot demo seed failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  void run();
}
