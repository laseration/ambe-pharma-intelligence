import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function normalizeRequestId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export const requestContextMiddleware: RequestHandler = (
  request,
  response,
  next,
) => {
  const incomingRequestId = normalizeRequestId(
    firstHeaderValue(request.headers[REQUEST_ID_HEADER]),
  );
  const requestId = incomingRequestId ?? randomUUID();

  request.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);

  next();
};
