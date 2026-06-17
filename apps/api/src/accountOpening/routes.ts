import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import {
  requireInternalOperatorAccess,
  resolveInternalActor,
} from '../http/auth';
import {
  asyncHandler,
  BadRequestError,
  NotFoundError,
  requireFound,
} from '../http/errors';
import { actorBodySchema } from '../http/routeSchemas';
import {
  idParamSchema,
  nullableTrimmedStringSchema,
  optionalNumberQuerySchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import {
  approveAccountOpeningCompletedFormFiling,
  createManualAccountOpeningCase,
  downloadAccountOpeningBinaryFillPreviewFile,
  downloadAccountOpeningFillPreviewFile,
  downloadAccountOpeningReviewedExportFile,
  exportAccountOpeningReviewedPack,
  fileAccountOpeningCompletedFormToSharePoint,
  generateAccountOpeningBinaryFillPreview,
  generateAccountOpeningFillPreview,
  generateAccountOpeningDraft,
  getAccountOpeningFieldMappingReview,
  getAccountOpeningCaseDetail,
  getAccountOpeningReadinessReport,
  listAccountOpeningCases,
  reprocessAccountOpeningCaseFromStoredSource,
  saveAccountOpeningMissingInfo,
  saveAccountOpeningFieldMappings,
  updateAccountOpeningCaseStatus,
  type AccountOpeningCaseDetail,
  type AccountOpeningCaseListItem,
  type AccountOpeningManualCaseCreated,
  type AccountOpeningMissingInfoResponses,
  type AccountOpeningStatusAction,
} from './service';
import { ACCOUNT_OPENING_REVIEW_EXPORT_FILE_NAMES } from './reviewExport';
import { ACCOUNT_OPENING_FILL_PREVIEW_FILE_NAMES } from './fillPreview';
import { ACCOUNT_OPENING_BINARY_FILL_PREVIEW_FILE_NAMES } from './binaryFillPreview';
import type { AccountOpeningFieldMappingSaveInput } from './fieldMapping';
import {
  attachAccountOpeningCaseDocument,
  isAllowedAccountOpeningUpload,
  MAX_ACCOUNT_OPENING_UPLOAD_BYTES,
} from './documentUpload';

type AccountOpeningRouteDependencies = {
  getCaseDetail: typeof getAccountOpeningCaseDetail;
  generateDraft: typeof generateAccountOpeningDraft;
  reprocessFromStoredSource: typeof reprocessAccountOpeningCaseFromStoredSource;
  getReadiness: typeof getAccountOpeningReadinessReport;
  getFieldMappings: typeof getAccountOpeningFieldMappingReview;
  saveFieldMappings: typeof saveAccountOpeningFieldMappings;
  generateFillPreview: typeof generateAccountOpeningFillPreview;
  downloadFillPreviewFile: typeof downloadAccountOpeningFillPreviewFile;
  generateBinaryFillPreview: typeof generateAccountOpeningBinaryFillPreview;
  downloadBinaryFillPreviewFile: typeof downloadAccountOpeningBinaryFillPreviewFile;
  approveCompletedFormFiling: typeof approveAccountOpeningCompletedFormFiling;
  fileCompletedFormToSharePoint: typeof fileAccountOpeningCompletedFormToSharePoint;
  exportPack: typeof exportAccountOpeningReviewedPack;
  downloadExportFile: typeof downloadAccountOpeningReviewedExportFile;
  saveMissingInfo: typeof saveAccountOpeningMissingInfo;
  updateStatus: typeof updateAccountOpeningCaseStatus;
  listCases: typeof listAccountOpeningCases;
  createManualCase: typeof createManualAccountOpeningCase;
  uploadDocument: typeof attachAccountOpeningCaseDocument;
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

const ACCOUNT_OPENING_STATUS_VALUES = [
  'PENDING_REVIEW',
  'APPROVED_FOR_COMPLETION',
  'NEEDS_INFO',
  'REJECTED',
  'CLOSED',
] as const;

const listQuerySchema = z.object({
  status: z.enum(ACCOUNT_OPENING_STATUS_VALUES).optional(),
  search: optionalTrimmedStringSchema,
  limit: optionalNumberQuerySchema,
});

const createCaseBodySchema = z
  .object({
    counterpartyName: z.string().trim().min(1).max(200),
    counterpartyEmail: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z
        .union([z.string().email().max(200), z.literal(''), z.null()])
        .optional(),
    ),
    caseType: z
      .enum(['SUPPLIER_ONBOARDING', 'CUSTOMER_ONBOARDING', 'UNKNOWN'])
      .default('UNKNOWN'),
    internalNote: nullableTrimmedStringSchema,
  })
  .merge(actorBodySchema);

const accountOpeningDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ACCOUNT_OPENING_UPLOAD_BYTES },
  fileFilter: (_request, file, callback) => {
    if (
      isAllowedAccountOpeningUpload(file.originalname, file.mimetype ?? null)
    ) {
      callback(null, true);
      return;
    }
    callback(
      new BadRequestError(
        'Unsupported file type. Allowed: PDF, image (PNG/JPG/WEBP), DOCX, XLSX, CSV, or TXT.',
      ),
    );
  },
});

const generateDraftBodySchema = actorBodySchema.partial().default({});
const reprocessStoredSourceBodySchema = actorBodySchema.partial().default({});
const completedFormFilingApprovalBodySchema = z
  .object({
    binaryFillPreviewId: optionalTrimmedStringSchema,
    approvalNote: optionalTrimmedStringSchema,
  })
  .merge(actorBodySchema);
const completedFormFilingBodySchema = z
  .object({
    binaryFillPreviewId: optionalTrimmedStringSchema,
    filingNote: optionalTrimmedStringSchema,
  })
  .merge(actorBodySchema);
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
const binaryFillPreviewFileNames = new Set<string>(
  ACCOUNT_OPENING_BINARY_FILL_PREVIEW_FILE_NAMES,
);

const defaultDependencies: AccountOpeningRouteDependencies = {
  getCaseDetail: getAccountOpeningCaseDetail,
  generateDraft: generateAccountOpeningDraft,
  reprocessFromStoredSource: reprocessAccountOpeningCaseFromStoredSource,
  getReadiness: getAccountOpeningReadinessReport,
  getFieldMappings: getAccountOpeningFieldMappingReview,
  saveFieldMappings: saveAccountOpeningFieldMappings,
  generateFillPreview: generateAccountOpeningFillPreview,
  downloadFillPreviewFile: downloadAccountOpeningFillPreviewFile,
  generateBinaryFillPreview: generateAccountOpeningBinaryFillPreview,
  downloadBinaryFillPreviewFile: downloadAccountOpeningBinaryFillPreviewFile,
  approveCompletedFormFiling: approveAccountOpeningCompletedFormFiling,
  fileCompletedFormToSharePoint: fileAccountOpeningCompletedFormToSharePoint,
  exportPack: exportAccountOpeningReviewedPack,
  downloadExportFile: downloadAccountOpeningReviewedExportFile,
  saveMissingInfo: saveAccountOpeningMissingInfo,
  updateStatus: updateAccountOpeningCaseStatus,
  listCases: listAccountOpeningCases,
  createManualCase: createManualAccountOpeningCase,
  uploadDocument: attachAccountOpeningCaseDocument,
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
    '/',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { query } = parseRequest<unknown, z.infer<typeof listQuerySchema>>(
        request,
        {
          query: listQuerySchema,
        },
      );

      const items: AccountOpeningCaseListItem[] = await dependencies.listCases({
        statuses: query.status ? [query.status] : undefined,
        search: query.search ?? null,
        limit: query.limit,
      });

      response.json({
        items,
        total: items.length,
        statusFilter: query.status ?? null,
      });
    }),
  );

  router.post(
    '/',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { body } = parseRequest<
        unknown,
        unknown,
        z.infer<typeof createCaseBodySchema>
      >(request, {
        body: createCaseBodySchema,
      });
      const actor = resolveInternalActor(request, body);

      const created: AccountOpeningManualCaseCreated =
        await dependencies.createManualCase({
          counterpartyName: body.counterpartyName,
          counterpartyEmail: body.counterpartyEmail ?? null,
          caseType: body.caseType,
          internalNote: body.internalNote ?? null,
          ...actor,
        });

      response.status(201).json({ item: created });
    }),
  );

  router.post(
    '/:id/documents',
    requireInternalOperatorAccess,
    accountOpeningDocumentUpload.single('file'),
    asyncHandler(async (request, response) => {
      const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
        params: idParamSchema,
      });
      const actor = resolveInternalActor(request, request.body ?? {});
      const file = request.file;
      if (!file) {
        throw new BadRequestError(
          'No file uploaded. Send the document as multipart field "file".',
        );
      }

      const result = await dependencies.uploadDocument({
        caseId: params.id,
        file: {
          fileName: file.originalname,
          mimeType: file.mimetype ?? null,
          buffer: file.buffer,
          size: file.size,
        },
        ...actor,
      });

      response.status(201).json({
        item: result.detail,
        classification: result.classification,
      });
    }),
  );

  router.get(
    '/:id',
    requireInternalOperatorAccess,
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
    requireInternalOperatorAccess,
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

  router.get(
    '/:id/readiness',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
        params: idParamSchema,
      });

      response.json({
        item: requireFound(
          await dependencies.getReadiness({ id: params.id }),
          'Account-opening case not found.',
        ),
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

  router.post(
    '/:id/reprocess-stored-source',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params, body } = parseRequest<
        z.infer<typeof idParamSchema>,
        unknown,
        z.infer<typeof reprocessStoredSourceBodySchema>
      >(request, {
        params: idParamSchema,
        body: reprocessStoredSourceBodySchema,
      });
      const actor = resolveInternalActor(request, body);

      const item = await dependencies.reprocessFromStoredSource({
        id: params.id,
        triggerType: 'MANUAL_REPROCESS',
        ...actor,
      });

      response.json({ item });
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

  router.post(
    '/:id/binary-fill-preview',
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

      const result = await dependencies.generateBinaryFillPreview({
        id: params.id,
        ...actor,
      });

      response.json(result);
    }),
  );

  router.get(
    '/:id/binary-fill-preview/:fileName',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params } = parseRequest<z.infer<typeof exportFileParamSchema>>(
        request,
        {
          params: exportFileParamSchema,
        },
      );
      const actor = resolveInternalActor(request, {});
      if (!binaryFillPreviewFileNames.has(params.fileName)) {
        throw new NotFoundError(
          'Account-opening binary fill preview file not found.',
        );
      }

      const file = await dependencies.downloadBinaryFillPreviewFile({
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
        .setHeader('cache-control', 'no-store')
        .send(Buffer.from(file.content));
    }),
  );

  router.post(
    '/:id/completed-form-filing/approve',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params, body } = parseRequest<
        z.infer<typeof idParamSchema>,
        unknown,
        z.infer<typeof completedFormFilingApprovalBodySchema>
      >(request, {
        params: idParamSchema,
        body: completedFormFilingApprovalBodySchema,
      });
      const actor = resolveInternalActor(request, body);

      const result = await dependencies.approveCompletedFormFiling({
        id: params.id,
        binaryFillPreviewId: body.binaryFillPreviewId ?? null,
        approvalNote: body.approvalNote ?? null,
        ...actor,
      });

      response.json(result);
    }),
  );

  router.post(
    '/:id/completed-form-filing/file',
    requireInternalOperatorAccess,
    asyncHandler(async (request, response) => {
      const { params, body } = parseRequest<
        z.infer<typeof idParamSchema>,
        unknown,
        z.infer<typeof completedFormFilingBodySchema>
      >(request, {
        params: idParamSchema,
        body: completedFormFilingBodySchema,
      });
      const actor = resolveInternalActor(request, body);

      const result = await dependencies.fileCompletedFormToSharePoint({
        id: params.id,
        binaryFillPreviewId: body.binaryFillPreviewId ?? null,
        filingNote: body.filingNote ?? null,
        ...actor,
      });

      response.json(result);
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
