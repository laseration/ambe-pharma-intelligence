import { Router } from 'express';
import { z } from 'zod';

import {
  getInternalAuthContext,
  requireInternalAdminAccess,
} from '../http/auth';
import { asyncHandler } from '../http/errors';
import { logger } from '../lib/logger';
import {
  idParamSchema,
  optionalTrimmedStringSchema,
  parseRequest,
} from '../http/validation';
import { handleTelegramUpdate, listInboundItems } from './inbound/service';
import { buildReviewSummary } from '../reviewQueue/summary';
import {
  previewDailySummary,
  previewOpportunityMessage,
  publishOpenOpportunities,
  publishOpportunity,
} from './service';

export const telegramRouter = Router();

const telegramUpdateSchema = z
  .object({
    update_id: z.number().int().optional(),
    message: z
      .object({
        message_id: z.number().int(),
        from: z
          .object({
            id: z.number().int(),
            first_name: z.string().optional(),
            last_name: z.string().optional(),
            username: z.string().optional(),
          })
          .passthrough()
          .optional(),
        chat: z
          .object({
            id: z.number().int(),
            type: z.string().trim().min(1),
          })
          .passthrough(),
        text: z.string().optional(),
        caption: z.string().optional(),
        document: z
          .object({
            file_id: z.string().trim().min(1),
            file_unique_id: z.string().trim().min(1),
            file_name: z.string().optional(),
            mime_type: z.string().optional(),
            file_size: z.number().int().optional(),
          })
          .passthrough()
          .optional(),
        photo: z
          .array(
            z
              .object({
                file_id: z.string().trim().min(1),
                file_unique_id: z.string().trim().min(1),
                file_size: z.number().int().optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const listInboundQuerySchema = z.object({
  processingStatus: optionalTrimmedStringSchema,
});

telegramRouter.post(
  '/inbound/updates',
  requireInternalAdminAccess,
  asyncHandler(async (request, response) => {
    const { body } = parseRequest<
      unknown,
      unknown,
      z.infer<typeof telegramUpdateSchema>
    >(request, {
      body: telegramUpdateSchema,
    });

    const auth = getInternalAuthContext(request);
    logger.info('Internal Telegram inbound update requested', {
      authRole: auth?.role ?? null,
      callerLabel: auth?.callerLabel ?? null,
    });

    const result = await handleTelegramUpdate(body);
    response.status(200).json(result);
  }),
);

telegramRouter.get(
  '/inbound',
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof listInboundQuerySchema>
    >(request, {
      query: listInboundQuerySchema,
    });

    const items = await listInboundItems({
      processingStatus: query.processingStatus,
    });

    response.json({
      items: items.map((item) => {
        const metadata =
          item.metadata &&
          typeof item.metadata === 'object' &&
          !Array.isArray(item.metadata)
            ? (item.metadata as Record<string, unknown>)
            : null;
        const textParsing =
          metadata?.textParsing &&
          typeof metadata.textParsing === 'object' &&
          !Array.isArray(metadata.textParsing)
            ? (metadata.textParsing as Record<string, unknown>)
            : null;

        return {
          ...item,
          reviewSummary: buildReviewSummary({
            processingStatus: item.processingStatus,
            fileType: item.fileType,
            fileName: item.fileName,
            inferredImportType:
              typeof metadata?.inferredImportType === 'string'
                ? metadata.inferredImportType
                : null,
            reason:
              (typeof metadata?.reason === 'string' && metadata.reason) ||
              item.errorMessage ||
              null,
            sender:
              item.senderDisplayName ||
              item.telegramUserId ||
              item.telegramChatId,
            subjectOrCaption: item.caption,
            parsedLineCount:
              typeof textParsing?.parsedRows === 'object' &&
              Array.isArray(textParsing.parsedRows)
                ? textParsing.parsedRows.length
                : null,
          }),
        };
      }),
    });
  }),
);

telegramRouter.post(
  '/opportunities/:id/preview',
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    const result = await previewOpportunityMessage(params.id);
    response.json(result);
  }),
);

telegramRouter.post(
  '/opportunities/:id/publish',
  requireInternalAdminAccess,
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    const auth = getInternalAuthContext(request);
    logger.info('Internal Telegram opportunity publish requested', {
      authRole: auth?.role ?? null,
      callerLabel: auth?.callerLabel ?? null,
      opportunityId: params.id,
    });

    const result = await publishOpportunity(params.id);
    response.status(201).json(result);
  }),
);

telegramRouter.post(
  '/opportunities/publish-open',
  requireInternalAdminAccess,
  asyncHandler(async (request, response) => {
    const auth = getInternalAuthContext(request);
    logger.info('Internal Telegram publish-open requested', {
      authRole: auth?.role ?? null,
      callerLabel: auth?.callerLabel ?? null,
    });

    const result = await publishOpenOpportunities();
    response.status(201).json(result);
  }),
);

telegramRouter.get(
  '/daily-summary/preview',
  asyncHandler(async (_request, response) => {
    const result = await previewDailySummary();
    response.json(result);
  }),
);
