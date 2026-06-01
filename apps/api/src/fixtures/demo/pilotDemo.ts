export const PILOT_DEMO_MARKER = 'AMBE_FAKE_PILOT_DEMO';

export type PilotDemoFixture = ReturnType<typeof loadPilotDemoFixture>;

export function loadPilotDemoFixture() {
  const receivedAt = new Date('2026-05-20T09:15:00.000Z');
  const approvedAt = new Date('2026-05-20T10:05:00.000Z');
  const orderedAt = new Date('2026-05-20T10:20:00.000Z');
  const confirmedAt = new Date('2026-05-20T11:00:00.000Z');
  const expectedDeliveryDate = new Date('2026-05-24T00:00:00.000Z');
  const saleDate = new Date('2026-05-15T00:00:00.000Z');
  const snapshotDate = new Date('2026-05-19T00:00:00.000Z');
  const sourceBlockText = [
    'FAKE DEMO SUPPLIER OFFER',
    'Amlodipine 5mg tablets 28 - GBP 7.90 - MOQ 100 - available now',
    'Cetirizine 10mg tablets 30 - GBP 1.85 - MOQ 240 - available now',
    'Demo data only. No real supplier or customer information.',
  ].join('\n');

  return {
    marker: PILOT_DEMO_MARKER,
    actor: {
      actorType: 'OPERATOR',
      actorIdentifier: 'demo-operator',
    },
    user: {
      id: 'demo-pilot-user',
      email: 'demo.operator@example.test',
      fullName: 'Demo Pilot Operator',
      role: 'OPS' as const,
    },
    supplier: {
      id: 'demo-pilot-supplier',
      name: 'Demo Northstar Pharma Supplies',
      normalizedName: 'demo northstar pharma supplies',
      country: 'GB',
      contactEmail: 'offers@northstar-demo.example.test',
    },
    customer: {
      id: 'demo-pilot-customer',
      name: 'Demo City Care Pharmacy',
      normalizedName: 'demo city care pharmacy',
      legalEntityName: 'Demo City Care Pharmacy Ltd',
      country: 'GB',
      city: 'London',
      primaryContactEmail: 'buyer@citycare-demo.example.test',
    },
    products: {
      pending: {
        id: 'demo-pilot-product-amlodipine',
        sku: 'DEMO-PILOT-AMLODIPINE-5MG-28',
        name: 'Demo Amlodipine 5mg Tablets 28',
        normalizedName: 'demo amlodipine 5mg tablets 28',
        manufacturer: 'Demo Generics Ltd',
        strength: '5mg',
        dosageForm: 'Tablet',
        packSize: '28 tablets',
        aliasName: 'Amlodipine 5mg tablets 28',
      },
      completed: {
        id: 'demo-pilot-product-cetirizine',
        sku: 'DEMO-PILOT-CETIRIZINE-10MG-30',
        name: 'Demo Cetirizine 10mg Tablets 30',
        normalizedName: 'demo cetirizine 10mg tablets 30',
        manufacturer: 'Demo Generics Ltd',
        strength: '10mg',
        dosageForm: 'Tablet',
        packSize: '30 tablets',
        aliasName: 'Cetirizine 10mg tablets 30',
      },
    },
    inboundEmail: {
      id: 'demo-pilot-inbound-email',
      sourceSystem: 'DEMO_PILOT',
      externalMessageId: 'demo-pilot-message-001',
      internetMessageId: '<demo-pilot-message-001@example.test>',
      conversationId: 'demo-pilot-conversation-001',
      fromEmail: 'offers@northstar-demo.example.test',
      fromName: 'Demo Northstar Offers',
      subject: 'FAKE DEMO supplier offer - Amlodipine and Cetirizine',
      rawText: sourceBlockText,
      bodyHash: 'demo-pilot-body-hash-001',
      senderDomain: 'northstar-demo.example.test',
      sourceTemplateFingerprint: 'demo-pilot-template-v1',
      attachmentSummary: {
        marker: PILOT_DEMO_MARKER,
        attachmentCount: 0,
        note: 'Fake demo email body only; no attachments.',
      },
      processingStatus: 'REVIEW_REQUIRED' as const,
      triageStatus: 'manual-review-required',
      sourceTrustScore: 72,
      structureConfidence: 88,
      businessWorthinessScore: 91,
      parserConfidence: 'HIGH',
      reviewReason: 'Demo: one offer awaits approval and one is already ordered.',
      receivedAt,
      processedAt: receivedAt,
    },
    document: {
      id: 'demo-pilot-document-body',
      kind: 'BODY_MAIN' as const,
      documentIndex: 0,
      label: 'Fake supplier offer email body',
      textContent: sourceBlockText,
      metadata: {
        marker: PILOT_DEMO_MARKER,
        source: 'fake demo email body',
      },
    },
    extractionRun: {
      id: 'demo-pilot-extraction-run',
      method: 'DETERMINISTIC' as const,
      status: 'COMPLETED' as const,
      extractorVersion: 'demo-pilot-fixture-v1',
      notes: {
        marker: PILOT_DEMO_MARKER,
        externalServicesCalled: false,
      },
    },
    offers: {
      pending: {
        id: 'demo-pilot-offer-amlodipine',
        offerFingerprint: 'demo-pilot-offer-amlodipine-v1',
        rawProductText: 'Amlodipine 5mg tablets 28',
        normalizedProductNameCandidate: 'demo amlodipine 5mg tablets 28',
        strengthCandidate: '5mg',
        dosageFormCandidate: 'Tablet',
        packSizeCandidate: '28 tablets',
        manufacturerCandidate: 'Demo Generics Ltd',
        supplierCandidate: 'Demo Northstar Pharma Supplies',
        priceCandidate: '7.90',
        currencyCandidate: 'GBP',
        minimumOrderQuantityCandidate: 100,
        availabilityCandidate: 'Available now',
        reviewReason:
          'Demo: operator should approve this staged supplier offer.',
        workflowId: 'demo-pilot-workflow-amlodipine',
      },
      completed: {
        id: 'demo-pilot-offer-cetirizine',
        offerFingerprint: 'demo-pilot-offer-cetirizine-v1',
        rawProductText: 'Cetirizine 10mg tablets 30',
        normalizedProductNameCandidate: 'demo cetirizine 10mg tablets 30',
        strengthCandidate: '10mg',
        dosageFormCandidate: 'Tablet',
        packSizeCandidate: '30 tablets',
        manufacturerCandidate: 'Demo Generics Ltd',
        supplierCandidate: 'Demo Northstar Pharma Supplies',
        priceCandidate: '1.85',
        currencyCandidate: 'GBP',
        minimumOrderQuantityCandidate: 240,
        availabilityCandidate: 'Available now',
        reviewReason:
          'Demo: already approved to show buy decision, execution, and deal.',
        workflowId: 'demo-pilot-workflow-cetirizine',
      },
    },
    commercial: {
      approvedAt,
      orderedAt,
      confirmedAt,
      expectedDeliveryDate,
      saleDate,
      snapshotDate,
      externalOrderReference: 'DEMO-PO-2026-001',
      invoiceReference: 'DEMO-INV-2026-001',
    },
  };
}
