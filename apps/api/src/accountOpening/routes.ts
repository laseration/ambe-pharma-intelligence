import { Router } from 'express';
import { z } from 'zod';

import {
  requireInternalOperatorAccess,
  resolveInternalActor,
} from '../http/auth';
import { asyncHandler, NotFoundError, requireFound } from '../http/errors';
import { actorBodySchema } from '../http/routeSchemas';
import {
  idParamSchema,
  nullableTrimmedStringSchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import {
  downloadAccountOpeningFillPreviewFile,
  downloadAccountOpeningReviewedExportFile,
  exportAccountOpeningReviewedPack,
  generateAccountOpeningFillPreview,
  generateAccountOpeningDraft,
  getAccountOpeningFieldMappingReview,
  getAccountOpeningCaseDetail,
  saveAccountOpeningMissingInfo,
  saveAccountOpeningFieldMappings,
  updateAccountOpeningCaseStatus,
  type AccountOpeningCaseDetail,
  type AccountOpeningMissingInfoResponses,
  type AccountOpeningStatusAction,
} from './service';
import { ACCOUNT_OPENING_REVIEW_EXPORT_FILE_NAMES } from './reviewExport';
import { ACCOUNT_OPENING_FILL_PREVIEW_FILE_NAMES } from './fillPreview';
import type { AccountOpeningFieldMappingSaveInput } from './fieldMapping';

type AccountOpeningRouteDependencies = {
  getCaseDetail: typeof getAccountOpeningCaseDetail;
  generateDraft: typeof generateAccountOpeningDraft;
  getFieldMappings: typeof getAccountOpeningFieldMappingReview;
  saveFieldMappings: typeof saveAccountOpeningFieldMappings;
  generateFillPreview: typeof generateAccountOpeningFillPreview;
  downloadFillPreviewFile: typeof downloadAccountOpeningFillPreviewFile;
  exportPack: typeof exportAccountOpeningReviewedPack;
  downloadExportFile: typeof downloadAccountOpeningReviewedExportFile;
  saveMissingInfo: typeof saveAccountOpeningMissingInfo;
  updateStatus: typeof updateAccountOpeningCaseStatus;
};

const missingInfoBodySchema = z
  .object({
    website: nullableTrimmedStringSchema,
    numberOfEmployees: nullableTrimmedStringSchema,
    businessHours: nullableTrimmedStringSchema,
    estimatedMonthlyPurchases: nullableTrimmedStringSchema,
    webOrdering: nullableTrimmedStringSchema,
    directDebitRequested: nullableTrimmedStringSchema,
    cdLicenceApplies: nullableTrimmedStringSchema,
    gphcPremisesNumber: nullableTrimmedStringSchema,
    cqcRegistration: nullableTrimmedStringSchema,
    reviewerNotes: nullableTrimmedStringSchema,
  })
  .merge(actorBodySchema);

const statusBodySchema = z
  .object({
    action: z.enum([
      'MARKED_NEEDS_INFO',
      'APPROVED_FOR_COMPLETION',
      'REJECTED',
    ]),
    note: optionalTrimmedStringSchema,
  })
  .merge(actorBodySchema);

const generateDraftBodySchema = actorBodySchema.partial().default({});
const fieldMappingStatusSchema = z.enum([
  'UNMAPPED',
  'MAPPED_SAFE',
  'MAPPED_REVIEW_REQUIRED',
  'BLOCKED',
  'IGNORED',
  'NEEDS_OPERATOR_INPUT',
]);
const fieldMappingSourceTypeSchema = z.enum([
  'DRAFT_FIELD',
  'SOURCE_EVIDENCE',
  'SYSTEM_RULE',
  'OPERATOR_CREATED',
]);
const fieldMappingSchema = z.object({
  id: nullableTrimmedStringSchema,
  supplierFieldLabel: z.string().trim().min(1).max(240),
  supplierSectionLabel: nullableTrimmedStringSchema,
  sourceType: fieldMappingSourceTypeSchema,
  sourceEvidenceId: nullableTrimmedStringSchema,
  evidenceSnippet: nullableTrimmedStringSchema,
  suggestedDraftFieldKey: nullableTrimmedStringSchema,
  mappedDraftFieldKey: nullableTrimmedStringSchema,
  status: fieldMappingStatusSchema.optional(),
  operatorNote: nullableTrimmedStringSchema,
});
const fieldMappingBodySchema = z
  .object({
    mappings: z.array(fieldMappingSchema).max(120),
  })
  .merge(actorBodySchema);
const exportFileParamSchema = idParamSchema.extend({
  fileName: z.string().trim().min(1).max(128),
});
const exportFileNames = new Set<string>(
  ACCOUNT_OPENING_REVIEW_EXPORT_FILE_NAMES,
);
const fillPreviewFileNames = new Set<string>(
  ACCOUNT_OPENING_FILL_PREVIEW_FILE_NAMES,
);

const defaultDependencies: AccountOpeningRouteDependencies = {
  getCaseDetail: getAccountOpeningCaseDetail,
  generateDraft: generateAccountOpeningDraft,
  getFieldMappings: getAccountOpeningFieldMappingReview,
  saveFieldMappings: saveAccountOpeningFieldMappings,
  generateFillPreview: generateAccountOpeningFillPreview,
  downloadFillPreviewFile: downloadAccountOpeningFillPreviewFile,
  exportPack: exportAccountOpeningReviewedPack,
  downloadExportFile: downloadAccountOpeningReviewedExportFile,
  saveMissingInfo: saveAccountOpeningMissingInfo,
  updateStatus: updateAccountOpeningCaseStatus,
};

function pickMissingInfoResponses(
  body: z.infer<typeof missingInfoBodySchema>,
): AccountOpeningMissingInfoResponses {
  return {
    website: body.website,
    numberOfEmployees: body.numberOfEmployees,
    businessHours: body.businessHours,
    estimatedMonthlyPurchases: body.estimatedMonthlyPurchases,
    webOrdering: body.webOrdering,
    directDebitRequested: body.directDebitRequested,
    cdLicenceApplies: body.cdLicenceApplies,
    gphcPremisesNumber: body.gphcPremisesNumber,
    cqcRegistration: body.cqcRegistration,
    reviewerNotes: body.reviewerNotes,
  };
}

function pickFieldMappings(
  body: z.infer<typeof fieldMappingBodySchema>,
): AccountOpeningFieldMappingSaveInput[] {
  return body.mappings.map((mapping) => ({
    id: mapping.id,
    supplierFieldLabel: mapping.supplierFieldLabel,
    supplierSectionLabel: mapping.supplierSectionLabel,
    sourceType: mapping.sourceType,
    sourceEvidenceId: mapping.sourceEvidenceId,
    evidenceSnippet: mapping.evidenceSnippet,
    suggestedDraftFieldKey: mapping.suggestedDraftFieldKey,
    mappedDraftFieldKey: mapping.mappedDraftFieldKey,
    status: mapping.status,
    operatorNote: mapping.operatorNote,
  }));
}

export function createAccountOpeningRouter(
  dependencies: AccountOpeningRouteDependencies = defaultDependencies,
) {
  const router = Router();

  router.get(
    '/:id',
    asyncHandler(async (request, response) => {
      const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
        params: idParamSchema,
      });

      response.json({
        item: requireFound(
          await dependencies.getCaseDetail(params.id),
          'Account-opening case not found.',
        ),
      });
    }),
  );

  router.get(
    '/:id/draft',
    asyncHandler(async (request, response) => {
      const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
        params: idParamSchema,
      });
      const item = requireFound(
        await dependencies.getCaseDetail(params.id),
        'Account-opening case not found.',
      );

      response.json({
        item: item.completionDraft,
      });
    }),
  );

  router.post(
    '/:id/generate-draft',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params, body } = parseRequest<
        z.infer<typeof idParamSchema>,
        unknown,
        z.infer<typeof generateDraftBodySchema>
      >(request, {
        params: idParamSchema,
        body: generateDraftBodySchema,
      });
      const actor = resolveInternalActor(request, body);

      const item = await dependencies.generateDraft({
        id: params.id,
        ...actor,
      });

      response.json({
        item,
        draft: item.completionDraft,
      });
    }),
  );

  router.get(
    '/:id/field-mappings',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
        params: idParamSchema,
      });

      response.json({
        item: await dependencies.getFieldMappings({
          id: params.id,
        }),
      });
    }),
  );

  router.patch(
    '/:id/field-mappings',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params, body } = parseRequest<
        z.infer<typeof idParamSchema>,
        unknown,
        z.infer<typeof fieldMappingBodySchema>
      >(request, {
        params: idParamSchema,
        body: fieldMappingBodySchema,
      });
      const actor = resolveInternalActor(request, body);

      const item = await dependencies.saveFieldMappings({
        id: params.id,
        mappings: pickFieldMappings(body),
        ...actor,
      });

      response.json({ item });
    }),
  );

  router.post(
    '/:id/fill-preview',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params, body } = parseRequest<
        z.infer<typeof idParamSchema>,
        unknown,
        z.infer<typeof generateDraftBodySchema>
      >(request, {
        params: idParamSchema,
        body: generateDraftBodySchema,
      });
      const actor = resolveInternalActor(request, body);

      const result = await dependencies.generateFillPreview({
        id: params.id,
        ...actor,
      });

      response.json(result);
    }),
  );

  router.get(
    '/:id/fill-preview/:fileName',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params } = parseRequest<z.infer<typeof exportFileParamSchema>>(
        request,
        {
          params: exportFileParamSchema,
        },
      );
      const actor = resolveInternalActor(request, {});
      if (!fillPreviewFileNames.has(params.fileName)) {
        throw new NotFoundError('Account-opening fill preview file not found.');
      }

      const file = await dependencies.downloadFillPreviewFile({
        id: params.id,
        fileName: params.fileName,
        ...actor,
      });

      response
        .status(200)
        .setHeader('content-type', file.contentType)
        .setHeader(
          'content-disposition',
          `attachment; filename="${file.fileName}"`,
        )
        .send(file.content);
    }),
  );

  router.get(
    '/:id/export-pack',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
        params: idParamSchema,
      });
      const actor = resolveInternalActor(request, {});
      const pack = await dependencies.exportPack({
        id: params.id,
        ...actor,
      });

      response.json({ item: pack });
    }),
  );

  router.get(
    '/:id/export-pack/:fileName',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params } = parseRequest<z.infer<typeof exportFileParamSchema>>(
        request,
        {
          params: exportFileParamSchema,
        },
      );
      const actor = resolveInternalActor(request, {});
      if (!exportFileNames.has(params.fileName)) {
        throw new NotFoundError(
          'Account-opening review export file not found.',
        );
      }

      const file = await dependencies.downloadExportFile({
        id: params.id,
        fileName: params.fileName,
        ...actor,
      });

      response
        .status(200)
        .setHeader('content-type', file.contentType)
        .setHeader(
          'content-disposition',
          `attachment; filename="${file.fileName}"`,
        )
        .send(file.content);
    }),
  );

  router.patch(
    '/:id/missing-info',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params, body } = parseRequest<
        z.infer<typeof idParamSchema>,
        unknown,
        z.infer<typeof missingInfoBodySchema>
      >(request, {
        params: idParamSchema,
        body: missingInfoBodySchema,
      });
      const actor = resolveInternalActor(request, body);

      const item: AccountOpeningCaseDetail = await dependencies.saveMissingInfo(
        {
          id: params.id,
          missingInfoResponses: pickMissingInfoResponses(body),
          ...actor,
        },
      );

      response.json({ item });
    }),
  );

  router.patch(
    '/:id/status',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params, body } = parseRequest<
        z.infer<typeof idParamSchema>,
        unknown,
        z.infer<typeof statusBodySchema>
      >(request, {
        params: idParamSchema,
        body: statusBodySchema,
      });
      const actor = resolveInternalActor(request, body);

      const item = await dependencies.updateStatus({
        id: params.id,
        action: body.action as AccountOpeningStatusAction,
        note: body.note ?? null,
        ...actor,
      });

      response.json({ item });
    }),
  );

  return router;
}

export const accountOpeningRouter = createAccountOpeningRouter();
