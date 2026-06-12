import crypto from 'node:crypto';
import type { Request, RequestHandler } from 'express';

import { env } from '../config/env';
import { ForbiddenError, UnauthorizedError } from './errors';

export type InternalApiRole = 'viewer' | 'operator' | 'admin';
export type InternalAuthenticatedRole = InternalApiRole;

export type InternalAuthContext = {
  role: InternalAuthenticatedRole;
  callerLabel: string | null;
  auditActorIdentifier: string;
};

declare global {
  namespace Express {
    interface Request {
      internalAuth?: InternalAuthContext;
    }
  }
}

const ROLE_RANK: Record<InternalApiRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

function isLocalDatabaseHost(host: string): boolean {
  const normalizedHost = host.trim().toLowerCase();

  return (
    normalizedHost === 'localhost' ||
    normalizedHost === '127.0.0.1' ||
    normalizedHost === '::1' ||
    normalizedHost.endsWith('.local')
  );
}

function hasLiveLookingDatabaseConfig(): boolean {
  return Boolean(
    env.databaseUrl &&
    env.databaseHost &&
    !isLocalDatabaseHost(env.databaseHost),
  );
}

function hasSideEffectIntegrationConfig(): boolean {
  return Boolean(
    env.telegramBotToken ||
    env.telegramInternalChatId ||
    env.telegramPollingEnabled ||
    env.emailAlertsEnabled ||
    env.emailInboundPollingEnabled ||
    env.microsoftMailTenantId ||
    env.microsoftMailClientId ||
    env.microsoftMailClientSecret ||
    env.microsoftGraphRefreshToken ||
    env.microsoftGraphSenderMailbox ||
    env.microsoftStorageTenantId ||
    env.microsoftStorageClientId ||
    env.microsoftStorageClientSecret ||
    env.sharePointAccountOpeningEnabled ||
    env.oneDriveAccountOpeningEnabled ||
    env.openAiApiKey ||
    env.openAiParserEnabled ||
    env.openAiEmailReviewEnabled,
  );
}

export function isInternalAuthEnforced(): boolean {
  return (
    env.nodeEnv === 'production' ||
    Boolean(env.internalViewerApiKey) ||
    Boolean(env.internalApiKey) ||
    Boolean(env.internalAdminApiKey) ||
    hasLiveLookingDatabaseConfig() ||
    hasSideEffectIntegrationConfig()
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function deriveRoleFromApiKey(
  providedApiKey: string,
): InternalAuthenticatedRole | null {
  if (
    env.internalAdminApiKey &&
    constantTimeEqual(env.internalAdminApiKey, providedApiKey)
  ) {
    return 'admin';
  }

  if (
    env.internalApiKey &&
    constantTimeEqual(env.internalApiKey, providedApiKey)
  ) {
    return 'operator';
  }

  if (
    env.internalViewerApiKey &&
    constantTimeEqual(env.internalViewerApiKey, providedApiKey)
  ) {
    return 'viewer';
  }

  return null;
}

function normalizeCallerLabel(request: Request): string | null {
  const rawValue =
    request.header('x-internal-caller-name') ??
    request.header('x-internal-client-id') ??
    null;
  const normalized = rawValue?.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 128);
}

function buildAuditActorIdentifier(
  role: InternalAuthenticatedRole,
  callerLabel: string | null,
): string {
  return callerLabel ? `internal-${role}:${callerLabel}` : `internal-${role}`;
}

export function getInternalAuthContext(
  request: Request,
): InternalAuthContext | null {
  return request.internalAuth ?? null;
}

export function resolveInternalActor(
  request: Request,
  actor: {
    actorType?: string | null;
    actorIdentifier?: string | null;
  },
  defaultActorType = 'OPERATOR',
): { actorType: string; actorIdentifier: string | null } {
  return {
    actorType: actor.actorType?.trim() || defaultActorType,
    actorIdentifier:
      actor.actorIdentifier?.trim() ||
      getInternalAuthContext(request)?.auditActorIdentifier ||
      null,
  };
}

export function requireInternalAccess(
  minimumRole: InternalApiRole = 'viewer',
): RequestHandler {
  return (request, _response, next) => {
    if (!isInternalAuthEnforced()) {
      next();
      return;
    }

    if (
      !env.internalViewerApiKey &&
      !env.internalApiKey &&
      !env.internalAdminApiKey
    ) {
      next(new UnauthorizedError('Internal API key is required.'));
      return;
    }

    const providedApiKey = request.header('x-internal-api-key')?.trim();
    if (!providedApiKey) {
      next(new UnauthorizedError('Invalid or missing internal API key.'));
      return;
    }

    const role = deriveRoleFromApiKey(providedApiKey);
    if (!role) {
      next(new UnauthorizedError('Invalid or missing internal API key.'));
      return;
    }

    const callerLabel = normalizeCallerLabel(request);
    request.internalAuth = {
      role,
      callerLabel,
      auditActorIdentifier: buildAuditActorIdentifier(role, callerLabel),
    };

    if (ROLE_RANK[role] < ROLE_RANK[minimumRole]) {
      next(new ForbiddenError('Insufficient internal API role.'));
      return;
    }

    next();
  };
}

export const requireInternalViewerAccess = requireInternalAccess('viewer');
export const requireInternalOperatorAccess = requireInternalAccess('operator');
export const requireInternalAdminAccess = requireInternalAccess('admin');
