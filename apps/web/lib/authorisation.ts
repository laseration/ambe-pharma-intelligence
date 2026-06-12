import type { WebAuthRole, WebAuthSession } from './internalWebAuth';

export type WebCapability =
  | 'dashboard:view'
  | 'inventory:view'
  | 'customers:view'
  | 'imports:view'
  | 'inbox:view'
  | 'opportunities:view'
  | 'opportunities:manage'
  | 'products:view'
  | 'deals:view'
  | 'review:view'
  | 'review:manage'
  | 'account-opening:view'
  | 'account-opening:manage'
  | 'account-opening:download'
  | 'trade-enquiries:view'
  | 'trade-enquiries:manage'
  | 'system:admin';

const ROLE_CAPABILITIES: Record<WebAuthRole, ReadonlySet<WebCapability>> = {
  viewer: new Set([
    'dashboard:view',
    'inventory:view',
    'customers:view',
    'opportunities:view',
    'products:view',
    'deals:view',
    'trade-enquiries:view',
  ]),
  operator: new Set([
    'dashboard:view',
    'inventory:view',
    'customers:view',
    'imports:view',
    'inbox:view',
    'opportunities:view',
    'opportunities:manage',
    'products:view',
    'deals:view',
    'review:view',
    'review:manage',
    'account-opening:view',
    'account-opening:manage',
    'account-opening:download',
    'trade-enquiries:view',
    'trade-enquiries:manage',
  ]),
  admin: new Set([
    'dashboard:view',
    'inventory:view',
    'customers:view',
    'imports:view',
    'inbox:view',
    'opportunities:view',
    'opportunities:manage',
    'products:view',
    'deals:view',
    'review:view',
    'review:manage',
    'account-opening:view',
    'account-opening:manage',
    'account-opening:download',
    'trade-enquiries:view',
    'trade-enquiries:manage',
    'system:admin',
  ]),
};

export class WebAuthorisationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
    readonly capability?: WebCapability,
  ) {
    super(message);
    this.name = 'WebAuthorisationError';
  }
}

export function capabilitiesForRole(
  role: WebAuthRole,
): readonly WebCapability[] {
  return [...ROLE_CAPABILITIES[role]];
}

export function roleHasCapability(
  role: WebAuthRole,
  capability: WebCapability,
): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

export function requireRole(
  session: WebAuthSession | null,
  role: WebAuthRole,
): WebAuthSession {
  if (!session) {
    throw new WebAuthorisationError('Web session is required.', 401);
  }

  if (session.role !== role) {
    throw new WebAuthorisationError(`Web role "${role}" is required.`, 403);
  }

  return session;
}

export function requireCapability(
  session: WebAuthSession | null,
  capability: WebCapability,
): WebAuthSession {
  if (!session) {
    throw new WebAuthorisationError(
      `Web capability "${capability}" requires a signed-in session.`,
      401,
      capability,
    );
  }

  if (!roleHasCapability(session.role, capability)) {
    throw new WebAuthorisationError(
      `Web capability "${capability}" is required for this action.`,
      403,
      capability,
    );
  }

  return session;
}
