import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOfferCorrectionService,
  getLearnedResolutionHintsWithRepository,
} from '../service';

function createRepositoryHarness() {
  const offers: Array<Record<string, any>> = [];
  const corrections: Array<Record<string, any>> = [];
  const correctionEvents: Array<Record<string, any>> = [];
  const sourceProfiles: Array<Record<string, any>> = [];
  const feedbacks: Array<Record<string, any>> = [];
  const productAliases: Array<Record<string, any>> = [];
  const suppliers: Array<Record<string, any>> = [];
  const products: Array<Record<string, any>> = [];
  let failOnSourceProfileWrite = false;
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

  const cloneArray = (items: Array<Record<string, any>>) =>
    items.map((item) => structuredClone(item));

  const cloneState = () => ({
    offers: cloneArray(offers),
    corrections: cloneArray(corrections),
    correctionEvents: cloneArray(correctionEvents),
    sourceProfiles: cloneArray(sourceProfiles),
    feedbacks: cloneArray(feedbacks),
    productAliases: cloneArray(productAliases),
    suppliers: cloneArray(suppliers),
    products: cloneArray(products),
  });

  const restoreState = (snapshot: ReturnType<typeof cloneState>) => {
    offers.splice(0, offers.length, ...snapshot.offers);
    corrections.splice(0, corrections.length, ...snapshot.corrections);
    correctionEvents.splice(
      0,
      correctionEvents.length,
      ...snapshot.correctionEvents,
    );
    sourceProfiles.splice(0, sourceProfiles.length, ...snapshot.sourceProfiles);
    feedbacks.splice(0, feedbacks.length, ...snapshot.feedbacks);
    productAliases.splice(0, productAliases.length, ...snapshot.productAliases);
    suppliers.splice(0, suppliers.length, ...snapshot.suppliers);
    products.splice(0, products.length, ...snapshot.products);
  };

  return {
    offers,
    corrections,
    correctionEvents,
    sourceProfiles,
    feedbacks,
    productAliases,
    suppliers,
    products,
    setFailOnSourceProfileWrite(value: boolean) {
      failOnSourceProfileWrite = value;
    },
    repository: {
      async transaction(callback: (repository: unknown) => Promise<unknown>) {
        const snapshot = cloneState();
        try {
          return await callback(this as never);
        } catch (error) {
          restoreState(snapshot);
          throw error;
        }
      },
      async findOfferById(emailDerivedOfferId: string) {
        return (offers.find((offer) => offer.id === emailDerivedOfferId) ??
          null) as never;
      },
      async listOffersByIds(emailDerivedOfferIds: string[]) {
        return offers.filter((offer) =>
          emailDerivedOfferIds.includes(offer.id),
        ) as never;
      },
      async listOffersForSourceProfile(input: Record<string, any>) {
        return offers.filter(
          (offer) =>
            offer.inboundEmail?.sourceSystem === input.sourceSystem &&
            offer.inboundEmail?.fromEmail === input.senderEmail &&
            offer.inboundEmail?.senderDomain === input.senderDomain &&
            offer.inboundEmail?.sourceTemplateFingerprint ===
              input.templateFingerprint,
        ) as never;
      },
      async listCorrections(filters: Record<string, any>) {
        return corrections
          .filter((correction) => {
            if (
              filters.emailDerivedOfferId &&
              correction.emailDerivedOfferId !== filters.emailDerivedOfferId
            ) {
              return false;
            }
            if (
              filters.status &&
              correction.correctionStatus !== filters.status
            ) {
              return false;
            }
            return true;
          })
          .sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime(),
          ) as never;
      },
      async findCorrectionById(correctionId: string) {
        return (corrections.find(
          (correction) => correction.id === correctionId,
        ) ?? null) as never;
      },
      async findEquivalentActiveCorrection() {
        return null as never;
      },
      async createCorrection(data: Record<string, unknown>) {
        const created = {
          id: nextId('correction'),
          createdAt: new Date(
            `2026-04-21T12:00:${String(corrections.length).padStart(2, '0')}.000Z`,
          ),
          updatedAt: new Date(
            `2026-04-21T12:00:${String(corrections.length).padStart(2, '0')}.000Z`,
          ),
          ...data,
        };
        corrections.push(created);
        return created as never;
      },
      async updateCorrection(
        correctionId: string,
        data: Record<string, unknown>,
      ) {
        const existing = corrections.find(
          (correction) => correction.id === correctionId,
        );
        if (!existing) {
          throw new Error('Correction not found.');
        }

        Object.assign(existing, data, {
          updatedAt: new Date('2026-04-21T12:30:00.000Z'),
        });
        return existing as never;
      },
      async createCorrectionEvent(data: Record<string, unknown>) {
        const created = {
          id: nextId('correction-event'),
          createdAt: new Date('2026-04-21T12:00:00.000Z'),
          ...data,
        };
        correctionEvents.push(created);
        return created as never;
      },
      async listFeedbackByOfferIds(emailDerivedOfferIds: string[]) {
        return feedbacks
          .filter(
            (feedback) =>
              feedback.emailDerivedOfferId &&
              emailDerivedOfferIds.includes(feedback.emailDerivedOfferId),
          )
          .sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime(),
          ) as never;
      },
      async findSourceProfileByKey(profileKey: string) {
        return (sourceProfiles.find(
          (profile) => profile.profileKey === profileKey,
        ) ?? null) as never;
      },
      async findSourceProfileById(sourceProfileId: string) {
        return (sourceProfiles.find(
          (profile) => profile.id === sourceProfileId,
        ) ?? null) as never;
      },
      async listSourceProfiles() {
        return sourceProfiles as never;
      },
      async createSourceProfile(data: Record<string, unknown>) {
        if (failOnSourceProfileWrite) {
          throw new Error('Simulated source profile write failure.');
        }

        const supplier =
          typeof data.supplierId === 'string'
            ? (suppliers.find((item) => item.id === data.supplierId) ?? null)
            : null;
        const created = {
          id: nextId('source-profile'),
          createdAt: new Date('2026-04-21T12:05:00.000Z'),
          updatedAt: new Date('2026-04-21T12:05:00.000Z'),
          supplier,
          ...data,
        };
        sourceProfiles.push(created);
        return created as never;
      },
      async updateSourceProfile(
        sourceProfileId: string,
        data: Record<string, unknown>,
      ) {
        if (failOnSourceProfileWrite) {
          throw new Error('Simulated source profile write failure.');
        }

        const existing = sourceProfiles.find(
          (profile) => profile.id === sourceProfileId,
        );
        if (!existing) {
          throw new Error('Source profile not found.');
        }

        const supplier =
          typeof data.supplierId === 'string'
            ? (suppliers.find((item) => item.id === data.supplierId) ?? null)
            : null;
        Object.assign(existing, data, {
          supplier,
          updatedAt: new Date('2026-04-21T12:10:00.000Z'),
        });
        return existing as never;
      },
      async listSourceProfilesForLookup(input: Record<string, any>) {
        return sourceProfiles.filter(
          (profile) =>
            profile.sourceSystem === input.sourceSystem &&
            (profile.senderEmail === input.senderEmail ||
              profile.senderDomain === input.senderDomain ||
              (profile.templateFingerprint &&
                profile.templateFingerprint === input.templateFingerprint)),
        ) as never;
      },
      async findSupplierById(supplierId: string) {
        return (suppliers.find((supplier) => supplier.id === supplierId) ??
          null) as never;
      },
      async findProductById(productId: string) {
        return (products.find((product) => product.id === productId) ??
          null) as never;
      },
      async findAliasByRawName(rawProductText: string) {
        const alias =
          productAliases.find((item) => item.aliasName === rawProductText) ??
          null;
        if (!alias) {
          return null;
        }

        const product =
          products.find((item) => item.id === alias.productId) ?? null;
        return product ? ({ ...alias, product } as never) : null;
      },
      async listAliasesForProduct(productId: string) {
        return productAliases.filter(
          (alias) => alias.productId === productId,
        ) as never;
      },
      async createProductAlias(data: Record<string, unknown>) {
        const created = {
          id: nextId('alias'),
          createdAt: new Date('2026-04-21T12:15:00.000Z'),
          updatedAt: new Date('2026-04-21T12:15:00.000Z'),
          ...data,
        };
        productAliases.push(created);
        return created as never;
      },
    },
  };
}

function seedOffer(
  harness: ReturnType<typeof createRepositoryHarness>,
  input: {
    id: string;
    senderEmail: string;
    senderDomain: string;
    templateFingerprint: string;
    rawProductText?: string;
    normalizedProductNameCandidate?: string | null;
    manufacturerCandidate?: string | null;
    aiAssisted?: boolean;
    status?: string;
  },
) {
  harness.offers.push({
    id: input.id,
    inboundEmailId: `email-${input.id}`,
    status: input.status ?? 'REVIEW_REQUIRED',
    rawProductText: input.rawProductText ?? 'Amlodipine 5mg tabs 28',
    normalizedProductNameCandidate:
      input.normalizedProductNameCandidate ?? 'amlodipine 5mg tabs 28',
    manufacturerCandidate: input.manufacturerCandidate ?? null,
    supplierCandidate: null,
    aiAssisted: input.aiAssisted ?? false,
    metadata: null,
    workflowItem: {
      id: `workflow-${input.id}`,
      status: 'NEW',
    },
    inboundEmail: {
      id: `email-${input.id}`,
      sourceSystem: 'MICROSOFT_GRAPH',
      fromEmail: input.senderEmail,
      senderDomain: input.senderDomain,
      subject: 'Current offer',
      sourceTemplateFingerprint: input.templateFingerprint,
      attachmentSummary: [],
      rawText: 'Current offer body',
      receivedAt: new Date('2026-04-21T09:00:00.000Z'),
      createdAt: new Date('2026-04-21T09:00:00.000Z'),
    },
  });
}

test('creating a correction stores corrected fields and writes source profile state', async () => {
  const harness = createRepositoryHarness();
  harness.suppliers.push({ id: 'supplier-1', name: 'Supplier One' });
  harness.products.push({ id: 'product-1', name: 'Amlodipine 5mg tabs 28' });
  seedOffer(harness, {
    id: 'offer-1',
    senderEmail: 'pricing@supplier-one.test',
    senderDomain: 'supplier-one.test',
    templateFingerprint: 'fingerprint-1',
  });
  const service = createOfferCorrectionService(harness.repository as never);

  const correction = await service.createCorrection({
    emailDerivedOfferId: 'offer-1',
    correctedSupplierId: 'supplier-1',
    correctedSupplierName: 'Supplier One',
    correctedProductId: 'product-1',
    correctedRawProductText: 'Amlo 5mg tabs 28',
    correctedNormalizedProductName: 'amlodipine 5mg tabs 28',
    correctedManufacturer: 'Manufacturer A',
    correctedUnitPrice: 8.4,
    correctedCurrencyCode: 'gbp',
    correctedMinimumOrderQuantity: 100,
    correctedAvailability: 'available',
    note: 'Operator corrected the extracted values.',
    actorType: 'USER',
    actorIdentifier: 'ops-1',
  });

  assert.equal(correction.correctedSupplierId, 'supplier-1');
  assert.equal(correction.correctedProductId, 'product-1');
  assert.equal(correction.correctedCurrencyCode, 'GBP');
  assert.equal(harness.correctionEvents.length >= 2, true);
  assert.equal(harness.sourceProfiles.length, 1);
  assert.equal(harness.sourceProfiles[0]?.sampleCount, 1);
  assert.equal(harness.sourceProfiles[0]?.correctedExtractionCount, 1);
});

test('repeated applied corrections supersede the prior active correction safely', async () => {
  const harness = createRepositoryHarness();
  seedOffer(harness, {
    id: 'offer-1',
    senderEmail: 'pricing@supplier-one.test',
    senderDomain: 'supplier-one.test',
    templateFingerprint: 'fingerprint-1',
  });
  const service = createOfferCorrectionService(harness.repository as never);

  const first = await service.createCorrection({
    emailDerivedOfferId: 'offer-1',
    correctedSupplierName: 'Supplier One',
    actorType: 'USER',
    actorIdentifier: 'ops-1',
  });
  const second = await service.createCorrection({
    emailDerivedOfferId: 'offer-1',
    correctedSupplierName: 'Supplier Two',
    actorType: 'USER',
    actorIdentifier: 'ops-1',
    note: 'Second correction supersedes the first.',
  });

  assert.equal(first.id !== second.id, true);
  assert.equal(
    harness.corrections.find((item) => item.id === first.id)?.correctionStatus,
    'SUPERSEDED',
  );
  assert.equal(
    harness.corrections.find((item) => item.id === second.id)?.correctionStatus,
    'APPLIED',
  );
});

test('corrections strengthen future supplier suggestion conservatively without bypassing review', async () => {
  const harness = createRepositoryHarness();
  harness.suppliers.push({ id: 'supplier-1', name: 'Supplier One' });
  seedOffer(harness, {
    id: 'offer-1',
    senderEmail: 'pricing@supplier-one.test',
    senderDomain: 'supplier-one.test',
    templateFingerprint: 'fingerprint-1',
    status: 'STAGED',
  });
  seedOffer(harness, {
    id: 'offer-2',
    senderEmail: 'pricing@supplier-one.test',
    senderDomain: 'supplier-one.test',
    templateFingerprint: 'fingerprint-1',
    status: 'STAGED',
  });
  const service = createOfferCorrectionService(harness.repository as never);

  await service.createCorrection({
    emailDerivedOfferId: 'offer-1',
    correctedSupplierId: 'supplier-1',
    correctedSupplierName: 'Supplier One',
    actorType: 'USER',
    actorIdentifier: 'ops-1',
  });
  await service.createCorrection({
    emailDerivedOfferId: 'offer-2',
    correctedSupplierId: 'supplier-1',
    correctedSupplierName: 'Supplier One',
    actorType: 'USER',
    actorIdentifier: 'ops-1',
  });

  const hints = await getLearnedResolutionHintsWithRepository(
    harness.repository as never,
    {
      sourceSystem: 'MICROSOFT_GRAPH',
      senderEmail: 'pricing@supplier-one.test',
      senderDomain: 'supplier-one.test',
      templateFingerprint: 'fingerprint-1',
      rawProductText: 'Amlodipine 5mg tabs 28',
      normalizedProductNameCandidate: 'amlodipine 5mg tabs 28',
    },
  );

  assert.equal(hints.supplierSuggestion?.supplierId, 'supplier-1');
  assert.equal((hints.supplierSuggestion?.confidence ?? 0) < 80, true);
  assert.equal(hints.shouldForceReview, false);
});

test('corrections strengthen future product alias matching safely', async () => {
  const harness = createRepositoryHarness();
  harness.products.push({ id: 'product-1', name: 'Amlodipine 5mg tabs 28' });
  seedOffer(harness, {
    id: 'offer-1',
    senderEmail: 'pricing@supplier-one.test',
    senderDomain: 'supplier-one.test',
    templateFingerprint: 'fingerprint-1',
    rawProductText: 'Amlo 5mg tabs 28',
    normalizedProductNameCandidate: null,
  });
  seedOffer(harness, {
    id: 'offer-2',
    senderEmail: 'pricing@supplier-one.test',
    senderDomain: 'supplier-one.test',
    templateFingerprint: 'fingerprint-2',
    rawProductText: 'Amlo 5mg tabs 28',
    normalizedProductNameCandidate: null,
  });
  const service = createOfferCorrectionService(harness.repository as never);

  await service.createCorrection({
    emailDerivedOfferId: 'offer-1',
    correctedProductId: 'product-1',
    correctedRawProductText: 'Amlo 5mg tabs 28',
    actorType: 'USER',
    actorIdentifier: 'ops-1',
  });

  const summaries = await service.getOfferLearningSummariesForOfferIds([
    'offer-2',
  ]);

  assert.equal(harness.productAliases.length, 1);
  assert.equal(summaries['offer-2']?.hasLearnedProductSuggestion, true);
  assert.equal(summaries['offer-2']?.learnedProductId, 'product-1');
});

test('source profile aggregates accepted, rejected, and corrected samples deterministically', async () => {
  const harness = createRepositoryHarness();
  harness.suppliers.push({ id: 'supplier-1', name: 'Supplier One' });
  seedOffer(harness, {
    id: 'offer-1',
    senderEmail: 'pricing@supplier-one.test',
    senderDomain: 'supplier-one.test',
    templateFingerprint: 'fingerprint-1',
  });
  seedOffer(harness, {
    id: 'offer-2',
    senderEmail: 'pricing@supplier-one.test',
    senderDomain: 'supplier-one.test',
    templateFingerprint: 'fingerprint-1',
    aiAssisted: true,
  });
  const service = createOfferCorrectionService(harness.repository as never);

  const correction = await service.createCorrection({
    emailDerivedOfferId: 'offer-1',
    correctedSupplierId: 'supplier-1',
    correctedSupplierName: 'Supplier One',
    actorType: 'USER',
    actorIdentifier: 'ops-1',
  });
  harness.feedbacks.push(
    {
      id: 'feedback-1',
      emailDerivedOfferId: 'offer-1',
      feedbackType: 'EXTRACTION',
      verdict: 'CORRECT',
      createdAt: new Date('2026-04-21T13:00:00.000Z'),
    },
    {
      id: 'feedback-2',
      emailDerivedOfferId: 'offer-2',
      feedbackType: 'EXTRACTION',
      verdict: 'INCORRECT',
      createdAt: new Date('2026-04-21T13:05:00.000Z'),
    },
    {
      id: 'feedback-3',
      emailDerivedOfferId: 'offer-1',
      feedbackType: 'SUPPLIER_RESOLUTION',
      verdict: 'CORRECT',
      createdAt: new Date('2026-04-21T13:10:00.000Z'),
    },
    {
      id: 'feedback-4',
      emailDerivedOfferId: 'offer-2',
      feedbackType: 'SUPPLIER_RESOLUTION',
      verdict: 'INCORRECT',
      createdAt: new Date('2026-04-21T13:15:00.000Z'),
    },
  );

  const profile = await service.getSourceProfile(harness.sourceProfiles[0]!.id);

  assert.equal(correction.id.length > 0, true);
  assert.equal(profile?.sampleCount, 2);
  assert.equal(profile?.acceptedExtractionCount, 1);
  assert.equal(profile?.rejectedExtractionCount, 1);
  assert.equal(profile?.correctedExtractionCount, 1);
  assert.equal(profile?.acceptedSupplierResolutionCount, 1);
  assert.equal(profile?.rejectedSupplierResolutionCount, 1);
  assert.equal(profile?.aiAssistCount, 1);
});

test('risky and trusted source tiers surface in learned summaries', async () => {
  const riskyHarness = createRepositoryHarness();
  riskyHarness.suppliers.push({ id: 'supplier-1', name: 'Supplier One' });
  seedOffer(riskyHarness, {
    id: 'offer-risky-1',
    senderEmail: 'pricing@risk.test',
    senderDomain: 'risk.test',
    templateFingerprint: 'fingerprint-risk',
  });
  seedOffer(riskyHarness, {
    id: 'offer-risky-2',
    senderEmail: 'pricing@risk.test',
    senderDomain: 'risk.test',
    templateFingerprint: 'fingerprint-risk',
  });
  const riskyService = createOfferCorrectionService(
    riskyHarness.repository as never,
  );
  await riskyService.createCorrection({
    emailDerivedOfferId: 'offer-risky-1',
    correctedSupplierId: 'supplier-1',
    correctedSupplierName: 'Supplier One',
    actorType: 'USER',
    actorIdentifier: 'ops-1',
  });
  riskyHarness.feedbacks.push(
    {
      id: 'risk-feedback-1',
      emailDerivedOfferId: 'offer-risky-1',
      feedbackType: 'EXTRACTION',
      verdict: 'INCORRECT',
      createdAt: new Date('2026-04-21T13:00:00.000Z'),
    },
    {
      id: 'risk-feedback-2',
      emailDerivedOfferId: 'offer-risky-2',
      feedbackType: 'SUPPLIER_RESOLUTION',
      verdict: 'INCORRECT',
      createdAt: new Date('2026-04-21T13:05:00.000Z'),
    },
  );
  const riskySummary = await riskyService.getOfferLearningSummariesForOfferIds([
    'offer-risky-2',
  ]);
  assert.equal(riskySummary['offer-risky-2']?.sourceReliabilityTier, 'RISKY');
  assert.equal(
    riskySummary['offer-risky-2']?.recommendedNextAction,
    'downgrade source',
  );

  const trustedHarness = createRepositoryHarness();
  trustedHarness.suppliers.push({ id: 'supplier-1', name: 'Supplier One' });
  seedOffer(trustedHarness, {
    id: 'offer-trusted-1',
    senderEmail: 'pricing@trusted.test',
    senderDomain: 'trusted.test',
    templateFingerprint: 'fingerprint-trusted',
    status: 'STAGED',
  });
  seedOffer(trustedHarness, {
    id: 'offer-trusted-2',
    senderEmail: 'pricing@trusted.test',
    senderDomain: 'trusted.test',
    templateFingerprint: 'fingerprint-trusted',
    status: 'STAGED',
  });
  seedOffer(trustedHarness, {
    id: 'offer-trusted-3',
    senderEmail: 'pricing@trusted.test',
    senderDomain: 'trusted.test',
    templateFingerprint: 'fingerprint-trusted',
    status: 'STAGED',
  });
  const trustedService = createOfferCorrectionService(
    trustedHarness.repository as never,
  );
  await trustedService.createCorrection({
    emailDerivedOfferId: 'offer-trusted-1',
    correctedSupplierId: 'supplier-1',
    correctedSupplierName: 'Supplier One',
    actorType: 'USER',
    actorIdentifier: 'ops-1',
  });
  trustedHarness.feedbacks.push(
    {
      id: 'trusted-feedback-1',
      emailDerivedOfferId: 'offer-trusted-1',
      feedbackType: 'EXTRACTION',
      verdict: 'CORRECT',
      createdAt: new Date('2026-04-21T13:00:00.000Z'),
    },
    {
      id: 'trusted-feedback-2',
      emailDerivedOfferId: 'offer-trusted-2',
      feedbackType: 'EXTRACTION',
      verdict: 'CORRECT',
      createdAt: new Date('2026-04-21T13:01:00.000Z'),
    },
    {
      id: 'trusted-feedback-3',
      emailDerivedOfferId: 'offer-trusted-3',
      feedbackType: 'SUPPLIER_RESOLUTION',
      verdict: 'CORRECT',
      createdAt: new Date('2026-04-21T13:02:00.000Z'),
    },
  );
  const trustedSummary =
    await trustedService.getOfferLearningSummariesForOfferIds([
      'offer-trusted-3',
    ]);
  assert.equal(
    trustedSummary['offer-trusted-3']?.sourceReliabilityTier,
    'TRUSTED',
  );
  assert.equal(
    trustedSummary['offer-trusted-3']?.recommendedNextAction,
    'apply learned mapping',
  );
});

test('correction and source-profile writes roll back together on failure', async () => {
  const harness = createRepositoryHarness();
  harness.suppliers.push({ id: 'supplier-1', name: 'Supplier One' });
  seedOffer(harness, {
    id: 'offer-1',
    senderEmail: 'pricing@supplier-one.test',
    senderDomain: 'supplier-one.test',
    templateFingerprint: 'fingerprint-1',
  });
  harness.setFailOnSourceProfileWrite(true);
  const service = createOfferCorrectionService(harness.repository as never);

  await assert.rejects(() =>
    service.createCorrection({
      emailDerivedOfferId: 'offer-1',
      correctedSupplierId: 'supplier-1',
      correctedSupplierName: 'Supplier One',
      actorType: 'USER',
      actorIdentifier: 'ops-1',
    }),
  );

  assert.equal(harness.corrections.length, 0);
  assert.equal(harness.correctionEvents.length, 0);
  assert.equal(harness.sourceProfiles.length, 0);
});
