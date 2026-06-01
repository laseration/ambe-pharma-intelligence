import { z } from 'zod';

import {
  decimalInputSchema,
  nullableTrimmedStringSchema,
  optionalDateInputSchema,
  optionalTrimmedStringSchema,
} from './validation';

export const operatorFeedbackTypeSchema = z.enum([
  'EXTRACTION',
  'SUPPLIER_RESOLUTION',
  'SIGNAL',
  'DEAL',
  'DRAFT',
]);

export const operatorFeedbackVerdictSchema = z.enum([
  'CORRECT',
  'PARTIALLY_CORRECT',
  'INCORRECT',
  'USEFUL',
  'NOT_USEFUL',
  'SAFE',
  'POLICY_ISSUE',
]);

export const actorBodySchema = z.object({
  actorType: optionalTrimmedStringSchema,
  actorIdentifier: nullableTrimmedStringSchema,
});

export const operatorFeedbackSchema = z
  .object({
    emailDerivedOfferId: optionalTrimmedStringSchema,
    offerWorkflowItemId: optionalTrimmedStringSchema,
    tradeOpportunityId: optionalTrimmedStringSchema,
    tradeMessageDraftId: optionalTrimmedStringSchema,
    feedbackType: operatorFeedbackTypeSchema,
    verdict: operatorFeedbackVerdictSchema,
    productTextCorrect: z.boolean().optional(),
    priceCorrect: z.boolean().optional(),
    currencyCorrect: z.boolean().optional(),
    supplierCorrect: z.boolean().optional(),
    manufacturerCorrect: z.boolean().optional(),
    availabilityCorrect: z.boolean().optional(),
    moqCorrect: z.boolean().optional(),
    note: optionalTrimmedStringSchema,
    flags: z.unknown().optional(),
    metadata: z.unknown().optional(),
  })
  .merge(actorBodySchema);

export const executionUpdateBodySchema = z
  .object({
    orderedQuantity: z.number().optional(),
    orderedUnitPrice: decimalInputSchema.optional(),
    orderedCurrencyCode: optionalTrimmedStringSchema,
    orderedMinimumOrderQuantity: z.number().optional(),
    confirmedAvailability: z.boolean().optional(),
    externalOrderReference: optionalTrimmedStringSchema,
    orderPlacedAt: optionalDateInputSchema,
    orderConfirmedAt: optionalDateInputSchema,
    expectedDeliveryDate: optionalDateInputSchema,
    receivedQuantity: z.number().optional(),
    receivedAt: optionalDateInputSchema,
    invoicedUnitPrice: decimalInputSchema.optional(),
    invoicedCurrencyCode: optionalTrimmedStringSchema,
    invoiceReference: optionalTrimmedStringSchema,
    invoicedAt: optionalDateInputSchema,
    fulfillmentStatus: z
      .enum([
        'NOT_STARTED',
        'ORDER_PLACED',
        'ORDER_CONFIRMED',
        'PARTIALLY_RECEIVED',
        'RECEIVED',
        'CANCELLED',
      ])
      .optional(),
    note: optionalTrimmedStringSchema,
    notes: optionalTrimmedStringSchema,
    metadata: z.unknown().optional(),
  })
  .merge(actorBodySchema);
