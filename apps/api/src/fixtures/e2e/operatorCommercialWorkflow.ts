import { Prisma } from '@prisma/client';

import { db } from '../../lib/db';

export const OPERATOR_COMMERCIAL_E2E = {
  marker: 'AMBE_OPERATOR_COMMERCIAL_E2E',
  inboundEmailId: 'e2e-operator-commercial-email',
  workflowId: 'e2e-operator-commercial-workflow',
  offerId: 'e2e-operator-commercial-offer',
  productId: 'e2e-operator-commercial-product',
  supplierId: 'e2e-operator-commercial-supplier',
  subject: 'E2E operator workflow staged supplier offer',
  productName: 'E2E Atorvastatin 20mg Tablets 28',
  supplierName: 'E2E Approved Supplier Ltd',
};

function metadata(extra?: Record<string, unknown>) {
  return {
    marker: OPERATOR_COMMERCIAL_E2E.marker,
    fakeE2eData: true,
    externalServicesCalled: false,
    ...extra,
  };
}

async function resetPriorCommercialState() {
  const tradeOpportunities = await db.tradeOpportunity.findMany({
    where: {
      OR: [
        { emailDerivedOfferId: OPERATOR_COMMERCIAL_E2E.offerId },
        { offerWorkflowItemId: OPERATOR_COMMERCIAL_E2E.workflowId },
      ],
    },
    select: { id: true },
  });
  const tradeOpportunityIds = tradeOpportunities.map((item) => item.id);

  if (tradeOpportunityIds.length > 0) {
    await db.operatorValidationFeedback.deleteMany({
      where: { tradeOpportunityId: { in: tradeOpportunityIds } },
    });
    await db.tradeMessageDraft.deleteMany({
      where: { tradeOpportunityId: { in: tradeOpportunityIds } },
    });
    await db.tradeOpportunityMessagingPolicy.deleteMany({
      where: { tradeOpportunityId: { in: tradeOpportunityIds } },
    });
    await db.tradeOpportunityEvent.deleteMany({
      where: { tradeOpportunityId: { in: tradeOpportunityIds } },
    });
    await db.tradeOpportunity.deleteMany({
      where: { id: { in: tradeOpportunityIds } },
    });
  }

  const decision = await db.buyDecision.findUnique({
    where: { emailDerivedOfferId: OPERATOR_COMMERCIAL_E2E.offerId },
    include: { execution: true },
  });

  if (decision?.execution) {
    await db.buyExecutionEvent.deleteMany({
      where: { buyExecutionId: decision.execution.id },
    });
    await db.buyExecution.delete({
      where: { id: decision.execution.id },
    });
  }

  if (decision) {
    await db.buyDecisionEvent.deleteMany({
      where: { buyDecisionId: decision.id },
    });
    await db.buyDecision.delete({
      where: { id: decision.id },
    });
  }
}

export async function seedOperatorCommercialWorkflowE2e() {
  await resetPriorCommercialState();

  const supplier = await db.supplier.upsert({
    where: { normalizedName: 'e2e approved supplier ltd' },
    update: {
      name: OPERATOR_COMMERCIAL_E2E.supplierName,
      country: 'GB',
      contactEmail: 'commercial-e2e-supplier@example.test',
      isActive: true,
    },
    create: {
      id: OPERATOR_COMMERCIAL_E2E.supplierId,
      name: OPERATOR_COMMERCIAL_E2E.supplierName,
      normalizedName: 'e2e approved supplier ltd',
      country: 'GB',
      contactEmail: 'commercial-e2e-supplier@example.test',
    },
  });

  const product = await db.product.upsert({
    where: { sku: 'E2E-COMMERCIAL-ATORVASTATIN-20MG-28' },
    update: {
      name: OPERATOR_COMMERCIAL_E2E.productName,
      normalizedName: 'e2e atorvastatin 20mg tablets 28',
      manufacturer: 'E2E Generics Ltd',
      strength: '20mg',
      dosageForm: 'Tablet',
      packSize: '28 tablets',
      isActive: true,
    },
    create: {
      id: OPERATOR_COMMERCIAL_E2E.productId,
      sku: 'E2E-COMMERCIAL-ATORVASTATIN-20MG-28',
      name: OPERATOR_COMMERCIAL_E2E.productName,
      normalizedName: 'e2e atorvastatin 20mg tablets 28',
      manufacturer: 'E2E Generics Ltd',
      strength: '20mg',
      dosageForm: 'Tablet',
      packSize: '28 tablets',
    },
  });

  await db.supplierQualification.upsert({
    where: { supplierId: supplier.id },
    update: {
      qualificationStatus: 'APPROVED',
      trustTier: 'MEDIUM',
      qualificationNote: 'Deterministic e2e supplier approval.',
      lastReviewedAt: new Date('2026-06-01T09:00:00.000Z'),
      reviewedByType: 'SYSTEM',
      reviewedByIdentifier: 'operator-commercial-e2e-seed',
      requiresManualApproval: false,
      canAutoApproveBuyDecisions: false,
      metadata: metadata(),
    },
    create: {
      id: 'e2e-operator-commercial-supplier-qualification',
      supplierId: supplier.id,
      qualificationStatus: 'APPROVED',
      trustTier: 'MEDIUM',
      qualificationNote: 'Deterministic e2e supplier approval.',
      lastReviewedAt: new Date('2026-06-01T09:00:00.000Z'),
      reviewedByType: 'SYSTEM',
      reviewedByIdentifier: 'operator-commercial-e2e-seed',
      requiresManualApproval: false,
      canAutoApproveBuyDecisions: false,
      metadata: metadata(),
    },
  });

  const inboundEmail = await db.inboundEmail.upsert({
    where: {
      sourceSystem_externalMessageId: {
        sourceSystem: 'E2E_OPERATOR_WORKFLOW',
        externalMessageId: 'e2e-operator-commercial-message',
      },
    },
    update: {
      fromEmail: 'commercial-e2e-supplier@example.test',
      fromName: 'Commercial E2E Supplier',
      subject: OPERATOR_COMMERCIAL_E2E.subject,
      rawText:
        'E2E staged supplier offer: atorvastatin 20mg tablets 28 GBP 4.75 MOQ 60.',
      senderDomain: 'example.test',
      processingStatus: 'REVIEW_REQUIRED',
      triageStatus: 'manual-review-required',
      sourceTrustScore: 88,
      structureConfidence: 90,
      businessWorthinessScore: 92,
      parserConfidence: 'HIGH',
      reviewReason: 'E2E staged offer awaits operator approval.',
      receivedAt: new Date('2026-06-10T08:00:00.000Z'),
      processedAt: new Date('2026-06-10T08:01:00.000Z'),
    },
    create: {
      id: OPERATOR_COMMERCIAL_E2E.inboundEmailId,
      sourceSystem: 'E2E_OPERATOR_WORKFLOW',
      externalMessageId: 'e2e-operator-commercial-message',
      internetMessageId: '<e2e-operator-commercial-message@example.test>',
      conversationId: 'e2e-operator-commercial-conversation',
      fromEmail: 'commercial-e2e-supplier@example.test',
      fromName: 'Commercial E2E Supplier',
      subject: OPERATOR_COMMERCIAL_E2E.subject,
      rawText:
        'E2E staged supplier offer: atorvastatin 20mg tablets 28 GBP 4.75 MOQ 60.',
      bodyHash: 'e2e-operator-commercial-body-hash',
      senderDomain: 'example.test',
      attachmentSummary: metadata({ attachmentCount: 0 }),
      processingStatus: 'REVIEW_REQUIRED',
      triageStatus: 'manual-review-required',
      sourceTrustScore: 88,
      structureConfidence: 90,
      businessWorthinessScore: 92,
      parserConfidence: 'HIGH',
      reviewReason: 'E2E staged offer awaits operator approval.',
      receivedAt: new Date('2026-06-10T08:00:00.000Z'),
      processedAt: new Date('2026-06-10T08:01:00.000Z'),
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
      label: 'E2E staged supplier offer body',
      textContent:
        'E2E staged supplier offer: atorvastatin 20mg tablets 28 GBP 4.75 MOQ 60.',
      metadata: metadata(),
    },
    create: {
      id: 'e2e-operator-commercial-document',
      inboundEmailId: inboundEmail.id,
      kind: 'BODY_MAIN',
      documentIndex: 0,
      label: 'E2E staged supplier offer body',
      textContent:
        'E2E staged supplier offer: atorvastatin 20mg tablets 28 GBP 4.75 MOQ 60.',
      metadata: metadata(),
    },
  });

  const extractionRun = await db.emailExtractionRun.upsert({
    where: { id: 'e2e-operator-commercial-extraction-run' },
    update: {
      inboundEmailId: inboundEmail.id,
      method: 'DETERMINISTIC',
      status: 'COMPLETED',
      extractorVersion: 'operator-commercial-e2e-v1',
      notes: metadata(),
    },
    create: {
      id: 'e2e-operator-commercial-extraction-run',
      inboundEmailId: inboundEmail.id,
      method: 'DETERMINISTIC',
      status: 'COMPLETED',
      extractorVersion: 'operator-commercial-e2e-v1',
      notes: metadata(),
    },
  });

  await db.emailDerivedOffer.upsert({
    where: {
      inboundEmailId_offerFingerprint: {
        inboundEmailId: inboundEmail.id,
        offerFingerprint: 'e2e-operator-commercial-offer-v1',
      },
    },
    update: {
      extractionRunId: extractionRun.id,
      sourceDocumentId: document.id,
      status: 'REVIEW_REQUIRED',
      sourceKind: 'EMAIL_BODY',
      sourceBlockText:
        'E2E staged supplier offer: atorvastatin 20mg tablets 28 GBP 4.75 MOQ 60.',
      rawProductText: OPERATOR_COMMERCIAL_E2E.productName,
      normalizedProductNameCandidate: product.normalizedName,
      strengthCandidate: '20mg',
      dosageFormCandidate: 'Tablet',
      packSizeCandidate: '28 tablets',
      manufacturerCandidate: 'E2E Generics Ltd',
      supplierCandidate: supplier.name,
      priceCandidate: new Prisma.Decimal('4.75'),
      currencyCandidate: 'GBP',
      minimumOrderQuantityCandidate: 60,
      availabilityCandidate: 'Available now',
      sourceTrustScore: 88,
      structureConfidence: 90,
      fieldConfidence: 91,
      entityResolutionConfidence: 89,
      promotionConfidence: 83,
      aiAssisted: false,
      reviewReason: 'operator_commercial_e2e',
      metadata: metadata(),
    },
    create: {
      id: OPERATOR_COMMERCIAL_E2E.offerId,
      inboundEmailId: inboundEmail.id,
      extractionRunId: extractionRun.id,
      sourceDocumentId: document.id,
      status: 'REVIEW_REQUIRED',
      sourceKind: 'EMAIL_BODY',
      sourceBlockText:
        'E2E staged supplier offer: atorvastatin 20mg tablets 28 GBP 4.75 MOQ 60.',
      rawProductText: OPERATOR_COMMERCIAL_E2E.productName,
      normalizedProductNameCandidate: product.normalizedName,
      strengthCandidate: '20mg',
      dosageFormCandidate: 'Tablet',
      packSizeCandidate: '28 tablets',
      manufacturerCandidate: 'E2E Generics Ltd',
      supplierCandidate: supplier.name,
      priceCandidate: new Prisma.Decimal('4.75'),
      currencyCandidate: 'GBP',
      minimumOrderQuantityCandidate: 60,
      availabilityCandidate: 'Available now',
      sourceTrustScore: 88,
      structureConfidence: 90,
      fieldConfidence: 91,
      entityResolutionConfidence: 89,
      promotionConfidence: 83,
      aiAssisted: false,
      reviewReason: 'operator_commercial_e2e',
      offerFingerprint: 'e2e-operator-commercial-offer-v1',
      metadata: metadata(),
    },
  });

  await db.entityResolutionCandidate.upsert({
    where: { id: 'e2e-operator-commercial-product-candidate' },
    update: {
      candidateId: product.id,
      candidateName: product.name,
      confidence: 92,
      selected: true,
      metadata: metadata(),
    },
    create: {
      id: 'e2e-operator-commercial-product-candidate',
      emailDerivedOfferId: OPERATOR_COMMERCIAL_E2E.offerId,
      entityType: 'PRODUCT',
      candidateId: product.id,
      candidateName: product.name,
      confidence: 92,
      reason: 'Deterministic e2e product match.',
      selected: true,
      metadata: metadata(),
    },
  });

  await db.entityResolutionCandidate.upsert({
    where: { id: 'e2e-operator-commercial-supplier-candidate' },
    update: {
      candidateId: supplier.id,
      candidateName: supplier.name,
      confidence: 94,
      selected: true,
      metadata: metadata(),
    },
    create: {
      id: 'e2e-operator-commercial-supplier-candidate',
      emailDerivedOfferId: OPERATOR_COMMERCIAL_E2E.offerId,
      entityType: 'SUPPLIER',
      candidateId: supplier.id,
      candidateName: supplier.name,
      confidence: 94,
      reason: 'Deterministic e2e supplier match.',
      selected: true,
      metadata: metadata(),
    },
  });

  await db.emailDerivedOfferEvidence.upsert({
    where: { id: 'e2e-operator-commercial-price-evidence' },
    update: {
      sourceDocumentId: document.id,
      fieldName: 'priceCandidate',
      rawText: 'GBP 4.75',
      confidence: 91,
      metadata: metadata(),
    },
    create: {
      id: 'e2e-operator-commercial-price-evidence',
      emailDerivedOfferId: OPERATOR_COMMERCIAL_E2E.offerId,
      sourceDocumentId: document.id,
      fieldName: 'priceCandidate',
      evidenceType: 'EXACT_TEXT',
      rawText: 'GBP 4.75',
      confidence: 91,
      metadata: metadata(),
    },
  });

  await db.offerWorkflowItem.upsert({
    where: { emailDerivedOfferId: OPERATOR_COMMERCIAL_E2E.offerId },
    update: {
      inboundEmailId: inboundEmail.id,
      status: 'NEW',
      priority: 'HIGH',
      priorityReason: 'Deterministic e2e staged offer awaits approval.',
      assigneeLabel: 'E2E operator',
      latestNote: 'Deterministic e2e staged offer awaits approval.',
      sourceKind: 'EMAIL_BODY',
      sourceReviewReason: 'operator_commercial_e2e',
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
      createdByIdentifier: 'operator-commercial-e2e-seed',
      completedAt: null,
    },
    create: {
      id: OPERATOR_COMMERCIAL_E2E.workflowId,
      emailDerivedOfferId: OPERATOR_COMMERCIAL_E2E.offerId,
      inboundEmailId: inboundEmail.id,
      status: 'NEW',
      priority: 'HIGH',
      priorityReason: 'Deterministic e2e staged offer awaits approval.',
      assigneeLabel: 'E2E operator',
      latestNote: 'Deterministic e2e staged offer awaits approval.',
      sourceKind: 'EMAIL_BODY',
      sourceReviewReason: 'operator_commercial_e2e',
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
      createdByIdentifier: 'operator-commercial-e2e-seed',
    },
  });

  await db.offerWorkflowEvent.upsert({
    where: { id: 'e2e-operator-commercial-workflow-created' },
    update: {
      previousStatus: null,
      newStatus: 'NEW',
      actorType: 'SYSTEM',
      actorIdentifier: 'operator-commercial-e2e-seed',
      note: 'Deterministic e2e staged offer created.',
      metadata: metadata(),
    },
    create: {
      id: 'e2e-operator-commercial-workflow-created',
      workflowItemId: OPERATOR_COMMERCIAL_E2E.workflowId,
      actionType: 'CREATED',
      previousStatus: null,
      newStatus: 'NEW',
      actorType: 'SYSTEM',
      actorIdentifier: 'operator-commercial-e2e-seed',
      note: 'Deterministic e2e staged offer created.',
      metadata: metadata(),
    },
  });

  return OPERATOR_COMMERCIAL_E2E;
}
