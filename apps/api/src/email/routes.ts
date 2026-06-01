import { Router } from 'express';
import { z } from 'zod';

import {
  getInternalAuthContext,
  requireInternalAdminAccess,
  requireInternalOperatorAccess,
} from '../http/auth';
import { asyncHandler } from '../http/errors';
import { logger } from '../lib/logger';
import {
  idParamSchema,
  nullableTrimmedStringSchema,
  optionalDateInputSchema,
  parseRequest,
} from '../http/validation';
import {
  ingestInboundEmail,
  listInboundEmailInboxItems,
} from './inbound/service';
import {
  previewDailySummaryEmail,
  previewEmailBodyParsing,
  previewOpportunityEmail,
  sendDailySummaryEmail,
  sendOpportunityEmail,
} from './service';

export const emailRouter = Router();

const emailAttachmentSchema = z.object({
  fileName: nullableTrimmedStringSchema,
  mimeType: nullableTrimmedStringSchema,
  content: z.union([z.string(), z.null()]).optional(),
  size: z.number().nullable().optional(),
  contentId: nullableTrimmedStringSchema,
  disposition: nullableTrimmedStringSchema,
});

const parsePreviewBodySchema = z.object({
  bodyText: z.string(),
});

const inboundMessageBodySchema = z.object({
  sourceSystem: nullableTrimmedStringSchema,
  externalMessageId: nullableTrimmedStringSchema,
  messageId: nullableTrimmedStringSchema,
  conversationId: nullableTrimmedStringSchema,
  from: z.string().trim().min(1),
  fromName: nullableTrimmedStringSchema,
  subject: nullableTrimmedStringSchema,
  bodyText: nullableTrimmedStringSchema,
  rawHtml: nullableTrimmedStringSchema,
  receivedAt: optionalDateInputSchema,
  supplierName: nullableTrimmedStringSchema,
  attachments: z.array(emailAttachmentSchema).optional(),
});

const listInboundMessagesQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['REVIEW_REQUIRED', 'FAILED', 'RECEIVED_ONLY']).optional(),
});

emailRouter.post(
  '/body/parse-preview',
  asyncHandler(async (request, response) => {
    const { body } = parseRequest<
      unknown,
      unknown,
      z.infer<typeof parsePreviewBodySchema>
    >(request, {
      body: parsePreviewBodySchema,
    });

    response.json(await previewEmailBodyParsing(body.bodyText));
  }),
);

emailRouter.post(
  '/inbound/messages',
  requireInternalAdminAccess,
  asyncHandler(async (request, response) => {
    const { body } = parseRequest<
      unknown,
      unknown,
      z.infer<typeof inboundMessageBodySchema>
    >(request, {
      body: inboundMessageBodySchema,
    });

    const auth = getInternalAuthContext(request);
    logger.info('Internal inbound email ingest requested', {
      authRole: auth?.role ?? null,
      callerLabel: auth?.callerLabel ?? null,
      from: body.from,
      sourceSystem: body.sourceSystem ?? null,
    });

    response.status(201).json(await ingestInboundEmail(body));
  }),
);

emailRouter.get(
  '/inbound/messages',
  requireInternalOperatorAccess,
  asyncHandler(async (request, response) => {
    const { query } = parseRequest<
      unknown,
      z.infer<typeof listInboundMessagesQuerySchema>
    >(request, {
      query: listInboundMessagesQuerySchema,
    });

    response.json({
      items: await listInboundEmailInboxItems({
        take: query.take,
        status: query.status,
      }),
    });
  }),
);

emailRouter.post(
  '/opportunities/:id/preview',
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    response.json(await previewOpportunityEmail(params.id));
  }),
);

emailRouter.post(
  '/opportunities/:id/send',
  requireInternalAdminAccess,
  asyncHandler(async (request, response) => {
    const { params } = parseRequest<z.infer<typeof idParamSchema>>(request, {
      params: idParamSchema,
    });

    const auth = getInternalAuthContext(request);
    logger.info('Internal opportunity email send requested', {
      authRole: auth?.role ?? null,
      callerLabel: auth?.callerLabel ?? null,
      opportunityId: params.id,
    });

    response.status(201).json(await sendOpportunityEmail(params.id));
  }),
);

emailRouter.get(
  '/daily-summary/preview',
  asyncHandler(async (_request, response) => {
    response.json(await previewDailySummaryEmail());
  }),
);

emailRouter.post(
  '/daily-summary/send',
  requireInternalAdminAccess,
  asyncHandler(async (_request, response) => {
    const auth = getInternalAuthContext(_request);
    logger.info('Internal daily summary email send requested', {
      authRole: auth?.role ?? null,
      callerLabel: auth?.callerLabel ?? null,
    });

    response.status(201).json(await sendDailySummaryEmail());
  }),
);
