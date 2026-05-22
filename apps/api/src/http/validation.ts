import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';

export type RequestSchemas = {
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
};

export function parseRequest<
  TParams = unknown,
  TQuery = unknown,
  TBody = unknown,
>(
  request: Request,
  schemas: RequestSchemas,
): {
  params: TParams;
  query: TQuery;
  body: TBody;
} {
  return {
    params: (schemas.params
      ? schemas.params.parse(request.params)
      : request.params) as TParams,
    query: (schemas.query
      ? schemas.query.parse(request.query)
      : request.query) as TQuery,
    body: (schemas.body
      ? schemas.body.parse(request.body ?? {})
      : (request.body ?? {})) as TBody,
  };
}

export const idParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const optionalTrimmedStringSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.string().min(1).optional(),
);

export const nullableTrimmedStringSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.union([z.string().min(1), z.null()]).optional(),
);

export const optionalBooleanQuerySchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const optionalNumberQuerySchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => Number.isFinite(Number(value)), 'Expected a number.')
  .transform((value) => Number(value))
  .optional();

export const optionalDateInputSchema = z.preprocess(
  (value) => {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    return trimmed;
  },
  z
    .union([
      z
        .string()
        .refine(
          (value) => !Number.isNaN(Date.parse(value)),
          'Invalid date value.',
        )
        .transform((value) => new Date(value)),
      z.null(),
    ])
    .optional(),
);

export const decimalInputSchema = z.union([
  z.number(),
  z.string().trim().min(1),
]);
