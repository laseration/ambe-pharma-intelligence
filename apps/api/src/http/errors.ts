import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import multer from 'multer';
import { ZodError } from 'zod';

import { logger, sanitizeLogValue } from '../lib/logger';
import { REQUEST_ID_HEADER } from './requestContext';

type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: ErrorCode,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden.') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

export type ApiErrorPayload = {
  error: {
    message: string;
    code: ErrorCode;
    requestId: string;
    nextAction: string;
    details?: unknown;
  };
};

function isConflictMessage(message: string): boolean {
  return (
    /requires explicit operator confirmation/i.test(message) ||
    /cannot .* before /i.test(message) ||
    /approval required/i.test(message) ||
    /needs review before execution/i.test(message) ||
    /corrected after approval; review again/i.test(message) ||
    /already executed/i.test(message) ||
    /blocked supplier/i.test(message) ||
    /already exists/i.test(message) ||
    /duplicate/i.test(message)
  );
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ValidationError('Request validation failed.', error.flatten());
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new AppError(
        'Uploaded file is too large.',
        413,
        'PAYLOAD_TOO_LARGE',
      );
    }

    return new BadRequestError(error.message);
  }

  if (error instanceof Error) {
    if (/not found/i.test(error.message)) {
      return new NotFoundError(error.message);
    }

    if (isConflictMessage(error.message)) {
      return new ConflictError(error.message);
    }
  }

  return new AppError('Internal server error.', 500, 'INTERNAL_ERROR');
}

function nextActionForError(error: AppError): string {
  switch (error.code) {
    case 'BAD_REQUEST':
    case 'VALIDATION_ERROR':
      return 'Check the submitted fields and try again.';
    case 'UNAUTHORIZED':
      return 'Sign in again or check the internal API credentials configured for the dashboard.';
    case 'FORBIDDEN':
      return 'Use an operator or admin session with permission for this action.';
    case 'NOT_FOUND':
      return 'Refresh the dashboard and confirm the item still exists.';
    case 'CONFLICT':
      return 'Review the item state, required confirmation, or duplicate record before retrying.';
    case 'PAYLOAD_TOO_LARGE':
      return 'Use a smaller file, split the import, or check the configured upload size limit.';
    case 'INTERNAL_ERROR':
      return 'Check the API logs with this request id, then verify database and integration configuration.';
  }
}

function responseRequestId(request: Request, response: Response): string {
  const existingHeader = response.getHeader(REQUEST_ID_HEADER);

  if (request.requestId) {
    return request.requestId;
  }

  if (typeof existingHeader === 'string') {
    return existingHeader;
  }

  return 'unavailable';
}

function buildErrorPayload(
  error: AppError,
  requestId: string,
): ApiErrorPayload {
  const payload: ApiErrorPayload = {
    error: {
      message: error.message,
      code: error.code,
      requestId,
      nextAction: nextActionForError(error),
    },
  };

  if (error.details !== undefined) {
    payload.error.details = sanitizeLogValue(error.details);
  }

  return payload;
}

export function asyncHandler(
  handler: (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => Promise<unknown> | unknown,
): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function requireFound<T>(
  value: T | null | undefined,
  message: string,
): T {
  if (value === null || value === undefined) {
    throw new NotFoundError(message);
  }

  return value;
}

export const errorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  _next,
) => {
  const normalized = normalizeError(error);
  const requestId = responseRequestId(request, response);
  const payload = buildErrorPayload(normalized, requestId);
  const logMeta: Record<string, unknown> = {
    requestId,
    method: request.method,
    path: request.originalUrl || request.url,
    statusCode: normalized.statusCode,
    code: normalized.code,
  };

  if (error instanceof Error) {
    logMeta.cause = {
      name: error.name,
      message: error.message,
      ...(normalized.statusCode >= 500 ? { stack: error.stack } : {}),
    };
  }

  if (normalized.statusCode >= 500) {
    logger.error('API request failed.', logMeta);
  } else {
    logger.warn('API request rejected.', logMeta);
  }

  response.status(normalized.statusCode).json(payload);
};
