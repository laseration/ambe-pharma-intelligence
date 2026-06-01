export type WebAuthRole = 'viewer' | 'operator' | 'admin';

export type WebAuthSession = {
  username: string;
  role: WebAuthRole;
  expiresAt: number;
};

type WebAuthEnv = Record<string, string | undefined>;

type WebAuthConfig =
  | {
      configured: true;
      username: string;
      password: string;
      role: WebAuthRole;
      sessionSecret: string;
      sessionTtlSeconds: number;
    }
  | {
      configured: false;
    };

export type LoginVerificationResult =
  | {
      authenticated: true;
      cookieValue: string;
      session: WebAuthSession;
    }
  | {
      authenticated: false;
      reason: 'invalid' | 'not-configured';
    };

type SessionPayload = {
  v: 1;
  sub: string;
  role: WebAuthRole;
  exp: number;
};

const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;
const MIN_SESSION_SECRET_LENGTH = 32;

export const WEB_AUTH_COOKIE_NAME = 'ambe_internal_session';

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readRole(value: string | undefined): WebAuthRole {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized === 'viewer' ||
    normalized === 'operator' ||
    normalized === 'admin'
  ) {
    return normalized;
  }

  return 'operator';
}

export function getWebAuthConfig(
  source: WebAuthEnv = process.env,
): WebAuthConfig {
  const username = source.WEB_AUTH_USERNAME?.trim() ?? '';
  const password = source.WEB_AUTH_PASSWORD?.trim() ?? '';
  const sessionSecret = source.WEB_AUTH_SESSION_SECRET?.trim() ?? '';

  if (
    !username ||
    !password ||
    sessionSecret.length < MIN_SESSION_SECRET_LENGTH
  ) {
    return { configured: false };
  }

  return {
    configured: true,
    username,
    password,
    role: readRole(source.WEB_AUTH_ROLE),
    sessionSecret,
    sessionTtlSeconds: readPositiveInteger(
      source.WEB_AUTH_SESSION_TTL_SECONDS,
      DEFAULT_SESSION_TTL_SECONDS,
    ),
  };
}

export function getWebSessionCookieOptions(input?: {
  source?: WebAuthEnv;
  maxAge?: number;
}) {
  const source = input?.source ?? process.env;

  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: source.NODE_ENV === 'production',
    path: '/',
    maxAge: input?.maxAge ?? DEFAULT_SESSION_TTL_SECONDS,
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '=',
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function encodeJson(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
  } catch {
    return null;
  }
}

async function signValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value),
  );

  return bytesToBase64Url(new Uint8Array(signature));
}

function isSessionPayload(
  value: SessionPayload | null,
): value is SessionPayload {
  return (
    value?.v === 1 &&
    typeof value.sub === 'string' &&
    value.sub.length > 0 &&
    (value.role === 'viewer' ||
      value.role === 'operator' ||
      value.role === 'admin') &&
    Number.isInteger(value.exp)
  );
}

export async function createWebSessionCookieValue(input: {
  username: string;
  role: WebAuthRole;
  source?: WebAuthEnv;
  now?: number;
}): Promise<{ cookieValue: string; session: WebAuthSession } | null> {
  const config = getWebAuthConfig(input.source);

  if (!config.configured) {
    return null;
  }

  const now = input.now ?? Date.now();
  const expiresAt = Math.floor(now / 1000) + config.sessionTtlSeconds;
  const payload = encodeJson({
    v: 1,
    sub: input.username,
    role: input.role,
    exp: expiresAt,
  } satisfies SessionPayload);
  const signature = await signValue(payload, config.sessionSecret);

  return {
    cookieValue: `${payload}.${signature}`,
    session: {
      username: input.username,
      role: input.role,
      expiresAt,
    },
  };
}

export async function verifyWebLogin(input: {
  username: string;
  password: string;
  source?: WebAuthEnv;
  now?: number;
}): Promise<LoginVerificationResult> {
  const config = getWebAuthConfig(input.source);

  if (!config.configured) {
    return { authenticated: false, reason: 'not-configured' };
  }

  const usernameMatches = constantTimeEqual(
    input.username.trim(),
    config.username,
  );
  const passwordMatches = constantTimeEqual(input.password, config.password);

  if (!usernameMatches || !passwordMatches) {
    return { authenticated: false, reason: 'invalid' };
  }

  const session = await createWebSessionCookieValue({
    username: config.username,
    role: config.role,
    source: input.source,
    now: input.now,
  });

  if (!session) {
    return { authenticated: false, reason: 'not-configured' };
  }

  return {
    authenticated: true,
    cookieValue: session.cookieValue,
    session: session.session,
  };
}

export async function readWebSession(
  cookieValue: string | undefined,
  source: WebAuthEnv = process.env,
  now = Date.now(),
): Promise<WebAuthSession | null> {
  const config = getWebAuthConfig(source);

  if (!config.configured || !cookieValue) {
    return null;
  }

  const [payload, signature, extra] = cookieValue.split('.');

  if (!payload || !signature || extra !== undefined) {
    return null;
  }

  const expectedSignature = await signValue(payload, config.sessionSecret);

  if (!constantTimeEqual(signature, expectedSignature)) {
    return null;
  }

  const decodedPayload = decodeJson<SessionPayload>(payload);

  if (!isSessionPayload(decodedPayload)) {
    return null;
  }

  if (decodedPayload.exp <= Math.floor(now / 1000)) {
    return null;
  }

  return {
    username: decodedPayload.sub,
    role: decodedPayload.role,
    expiresAt: decodedPayload.exp,
  };
}
