import { WorkflowError, type WorkflowErrorCode } from '@rj/content-engine';
import { ResearchValidationError } from '@rj/research-engine';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';

/** API error codes: the WorkflowError codes plus a few transport-level ones. */
export type ApiErrorCode = WorkflowErrorCode | 'VALIDATION_ERROR' | 'CONFLICT' | 'INTERNAL';

const STATUS: Record<ApiErrorCode, ContentfulStatusCode> = {
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  VALIDATION_ERROR: 400,
  INVALID_ACTOR: 400,
  INVALID_TRANSITION: 409,
  GATE_NOT_SATISFIED: 409,
  EMERGENCY_STOP: 423,
  NOT_AUTHORIZED: 403,
  BINDING_MISMATCH: 409,
  SELF_REVIEW: 403,
  DUPLICATE_TOPIC: 409,
  ALREADY_PUBLISHED: 409,
  CONFLICT: 409,
  INTERNAL: 500,
};

/** Thrown by routes; rendered as `{ error: { code, message, details } }`. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorBody(code: ApiErrorCode, message: string, details: Record<string, unknown> = {}) {
  return { error: { code, message, details } };
}

export function handleError(err: unknown, c: Context) {
  if (err instanceof WorkflowError || err instanceof ApiError) {
    return c.json(errorBody(err.code, err.message, err.details), STATUS[err.code] ?? 400);
  }
  if (err instanceof ResearchValidationError) {
    return c.json(errorBody('VALIDATION_ERROR', err.message), 400);
  }
  if (err instanceof z.ZodError) {
    return c.json(errorBody('VALIDATION_ERROR', 'Invalid input', { issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }), 400);
  }
  // Never echo internals that could contain paths or secrets; log a short line server-side.
  console.error('[mission-control] unhandled error:', err instanceof Error ? err.message : String(err));
  return c.json(errorBody('INTERNAL', 'Internal server error'), 500);
}

/** Parses a JSON body with a Zod schema; throws VALIDATION_ERROR on bad JSON or shape. */
export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Body must be valid JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}
