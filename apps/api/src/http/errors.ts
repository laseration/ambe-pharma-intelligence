import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import multer from 'multer';
import { ZodError } from 'zod';

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

function isConflictMessage(message: string): boolean {
  return (
    /requires explicit operator confirmation/i.test(message) ||
    /cannot .* before /i.test(message) ||
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
  _request,
  response,
  _next,
) => {
  const normalized = normalizeError(error);
  const payload: Record<string, unknown> = {
    error: normalized.message,
    code: normalized.code,
  };

  if (normalized.details !== undefined) {
    payload.details = normalized.details;
  }

  response.status(normalized.statusCode).json(payload);
};
