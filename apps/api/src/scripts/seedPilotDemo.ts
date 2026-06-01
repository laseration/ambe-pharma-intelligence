import { Prisma } from '@prisma/client';

import { loadPilotDemoFixture, PILOT_DEMO_MARKER } from '../fixtures/demo/pilotDemo';
import { env } from '../config/env';
import { db } from '../lib/db';
import { classifyDatabaseUrlForLocalSmoke } from '../startup/localSmokeSafety';

const fixture = loadPilotDemoFixture();

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
      sourceTemplateFingerprint:
        fixture.inboundEmail.sourceTemplateFingerprint,
      attachmentSummary: fixture.inboundEmail.attachmentSummary,
      processingStatus: fixture.inboundEmail.processingStatus,
      triageStatus: fixture.inboundEmail.triageStatus,
      sourceTrustScore: fixture.inboundEmail.sourceTrustScore,
      structureConfidence: fixture.inboundEmail.structureConfidence,
      businessWorthinessScore:
        fixture.inboundEmail.businessWorthinessScore,
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
      sourceTemplateFingerprint:
        fixture.inboundEmail.sourceTemplateFingerprint,
      attachmentSummary: fixture.inboundEmail.attachmentSummary,
      processingStatus: fixture.inboundEmail.processingStatus,
      triageStatus: fixture.inboundEmail.triageStatus,
      sourceTrustScore: fixture.inboundEmail.sourceTrustScore,
      structureConfidence: fixture.inboundEmail.structureConfidence,
      businessWorthinessScore:
        fixture.inboundEmail.businessWorthinessScore,
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
  offer: typeof fixture.offers.pending;
  inboundEmailId: string;
  documentId: string;
  supplierId: string;
  productId: string;
}) {
  const offer = await db.emailDerivedOffer.upsert({
    where: {
      inboundEmailId_offerFingerprint: {
        inboundEmailId: input.inboundEmailId,
        offerFingerprint: input.offer.offerFingerprint,
      },
    },
    update: {
      extractionRunId: fixture.extractionRun.id,
      sourceDocumentId: input.documentId,
      status: 'REVIEW_REQUIRED',
      sourceKind: 'EMAIL_BODY',
      sourceBlockText: fixture.inboundEmail.rawText,
      rawProductText: input.offer.rawProductText,
      normalizedProductNameCandidate:
        input.offer.normalizedProductNameCandidate,
      strengthCandidate: input.offer.strengthCandidate,
      dosageFormCandidate: input.offer.dosageFormCandidate,
      packSizeCandidate: input.offer.packSizeCandidate,
      manufacturerCandidate: input.offer.manufacturerCandidate,
      supplierCandidate: input.offer.supplierCandidate,
      priceCandidate: new Prisma.Decimal(input.offer.priceCandidate),
      currencyCandidate: input.offer.currencyCandidate,
      minimumOrderQuantityCandidate:
        input.offer.minimumOrderQuantityCandidate,
      availabilityCandidate: input.offer.availabilityCandidate,
      sourceTrustScore: 72,
      structureConfidence: 88,
      fieldConfidence: 86,
      entityResolutionConfidence: 84,
      promotionConfidence: 68,
      aiAssisted: false,
      reviewReason: input.offer.reviewReason,
      metadata: demoMetadata({ walkthroughOffer: input.offer.id }),
    },
    create: {
      id: input.offer.id,
      inboundEmailId: input.inboundEmailId,
      extractionRunId: fixture.extractionRun.id,
      sourceDocumentId: input.documentId,
      status: 'REVIEW_REQUIRED',
      sourceKind: 'EMAIL_BODY',
      sourceBlockText: fixture.inboundEmail.rawText,
      rawProductText: input.offer.rawProductText,
      normalizedProductNameCandidate:
        input.offer.normalizedProductNameCandidate,
      strengthCandidate: input.offer.strengthCandidate,
      dosageFormCandidate: input.offer.dosageFormCandidate,
      packSizeCandidate: input.offer.packSizeCandidate,
      manufacturerCandidate: input.offer.manufacturerCandidate,
      supplierCandidate: input.offer.supplierCandidate,
      priceCandidate: new Prisma.Decimal(input.offer.priceCandidate),
      currencyCandidate: input.offer.currencyCandidate,
      minimumOrderQuantityCandidate:
        input.offer.minimumOrderQuantityCandidate,
      availabilityCandidate: input.offer.availabilityCandidate,
      sourceTrustScore: 72,
      structureConfidence: 88,
      fieldConfidence: 86,
      entityResolutionConfidence: 84,
      promotionConfidence: 68,
      aiAssisted: false,
      reviewReason: input.offer.reviewReason,
      offerFingerprint: input.offer.offerFingerprint,
      metadata: demoMetadata({ walkthroughOffer: input.offer.id }),
    },
  });

  await Promise.all([
    upsertResolutionCandidate({
      id: `${offer.id}-product-candidate`,
      emailDerivedOfferId: offer.id,
      entityType: 'PRODUCT',
      candidateId: input.productId,
      candidateName: input.offer.rawProductText,
      confidence: 86,
      reason: 'Fake demo exact product alias match.',
      selected: true,
    }),
    upsertResolutionCandidate({
      id: `${offer.id}-supplier-candidate`,
      emailDerivedOfferId: offer.id,
      entityType: 'SUPPLIER',
      candidateId: input.supplierId,
      candidateName: input.offer.supplierCandidate,
      confidence: 84,
      reason: 'Fake demo sender domain and supplier name match.',
      selected: true,
    }),
    upsertOfferEvidence({
      id: `${offer.id}-price-evidence`,
      emailDerivedOfferId: offer.id,
      sourceDocumentId: input.documentId,
      fieldName: 'priceCandidate',
      rawText: `${input.offer.currencyCandidate} ${input.offer.priceCandidate}`,
    }),
    upsertOfferEvidence({
      id: `${offer.id}-product-evidence`,
      emailDerivedOfferId: offer.id,
      sourceDocumentId: input.documentId,
      fieldName: 'rawProductText',
      rawText: input.offer.rawProductText,
    }),
  ]);

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
  status: 'NEW' | 'ORDERED';
  note: string;
}) {
  const workflow = await db.offerWorkflowItem.upsert({
    where: { emailDerivedOfferId: input.offerId },
    update: {
      inboundEmailId: input.inboundEmailId,
      status: input.status,
      priority: input.status === 'NEW' ? 'HIGH' : 'MEDIUM',
      priorityReason:
        input.status === 'NEW'
          ? 'Fake demo item waiting for operator approval.'
          : 'Fake demo item already approved and ordered.',
      assigneeLabel: 'Demo operator',
      latestNote: input.note,
      sourceKind: 'EMAIL_BODY',
      sourceReviewReason: input.note,
      aiAssisted: false,
      hasUnresolvedSupplier: false,
      hasConflictingSupplierCues: false,
      hasManufacturerAmbiguity: false,
      supplierQualificationStatus: 'APPROVED',
      hasUnknownSupplierQualification: false,
      hasRestrictedSupplier: false,
      hasBlockedSupplier: false,
      qualificationRiskNote: null,
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
      priority: input.status === 'NEW' ? 'HIGH' : 'MEDIUM',
      priorityReason:
        input.status === 'NEW'
          ? 'Fake demo item waiting for operator approval.'
          : 'Fake demo item already approved and ordered.',
      assigneeLabel: 'Demo operator',
      latestNote: input.note,
      sourceKind: 'EMAIL_BODY',
      sourceReviewReason: input.note,
      aiAssisted: false,
      hasUnresolvedSupplier: false,
      hasConflictingSupplierCues: false,
      hasManufacturerAmbiguity: false,
      supplierQualificationStatus: 'APPROVED',
      hasUnknownSupplierQualification: false,
      hasRestrictedSupplier: false,
      hasBlockedSupplier: false,
      qualificationRiskNote: null,
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
      metadata: demoMetadata(),
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
      metadata: demoMetadata(),
    },
  });

  if (input.status === 'ORDERED') {
    await db.offerWorkflowEvent.upsert({
      where: { id: `${input.workflowId}-approved-event` },
      update: {
        previousStatus: 'NEW',
        newStatus: 'APPROVED_TO_BUY',
        actorType: fixture.actor.actorType,
        actorIdentifier: fixture.actor.actorIdentifier,
        note: 'Fake demo approval created by demo seed.',
        metadata: demoMetadata(),
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
        metadata: demoMetadata(),
      },
    });
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
  });
  const commercial = await upsertCommercialContext({
    supplierId: base.supplier.id,
    customerId: base.customer.id,
    completedProductId: base.completedProduct.id,
    completedOfferId: email.completedOffer.id,
    completedWorkflowId: completedWorkflow.id,
  });

  return {
    pendingWorkflowId: pendingWorkflow.id,
    completedWorkflowId: completedWorkflow.id,
    buyDecisionId: commercial.buyDecision.id,
    buyExecutionId: commercial.execution.id,
    tradeOpportunityId: commercial.tradeOpportunity.id,
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
