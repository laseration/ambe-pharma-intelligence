import { createHash } from 'node:crypto';

import { env } from '../config/env';

type GraphTokenFetchOptions = {
  fetchImpl?: typeof fetch;
  now?: () => number;
};

type CachedGraphToken = {
  key: string;
  token: string;
  expiresAtMs: number;
};

// Refresh slightly BEFORE the real expiry so a cached token can never expire
// mid-request because of network latency or small clock skew.
const TOKEN_EXPIRY_SKEW_MS = 60_000;
// Conservative fallback lifetime, used only when the token response omits or
// returns an unparseable `expires_in`. Kept short so a malformed response can
// never pin a stale token for long.
const TOKEN_FALLBACK_TTL_MS = 5 * 60_000;

let cachedToken: CachedGraphToken | null = null;

export function isMicrosoftGraphConfigured(): boolean {
  return Boolean(
    env.microsoftMailTenantId &&
    env.microsoftMailClientId &&
    (env.microsoftMailClientSecret || env.microsoftGraphRefreshToken) &&
    env.microsoftGraphSenderMailbox,
  );
}

// Cache key derived from the credential inputs that determine the token. If any
// of them change (e.g. a credential rotation, or tests overriding env) the
// cached token is discarded. The secret/refresh-token is reduced to a one-way
// SHA-256 fingerprint so the raw credential is never held in the key string.
function currentTokenCacheKey(): string {
  const credential =
    env.microsoftGraphRefreshToken || env.microsoftMailClientSecret || '';
  const credentialFingerprint = createHash('sha256')
    .update(credential)
    .digest('hex');

  return [
    env.microsoftMailTenantId,
    env.microsoftMailClientId,
    env.microsoftGraphRefreshToken ? 'refresh-token' : 'client-secret',
    credentialFingerprint,
  ].join('|');
}

export async function getMicrosoftGraphAccessToken(
  options: GraphTokenFetchOptions = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const cacheKey = currentTokenCacheKey();

  if (
    cachedToken &&
    cachedToken.key === cacheKey &&
    now() < cachedToken.expiresAtMs - TOKEN_EXPIRY_SKEW_MS
  ) {
    return cachedToken.token;
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(env.microsoftMailTenantId)}/oauth2/v2.0/token`;
  const tokenBody = new URLSearchParams(
    env.microsoftGraphRefreshToken
      ? {
          client_id: env.microsoftMailClientId,
          refresh_token: env.microsoftGraphRefreshToken,
          scope: 'https://graph.microsoft.com/Mail.ReadWrite offline_access',
          grant_type: 'refresh_token',
        }
      : {
          client_id: env.microsoftMailClientId,
          client_secret: env.microsoftMailClientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        },
  );
  const response = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenBody.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Microsoft Graph token request failed with status ${response.status}. ${errorText}`,
    );
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token) {
    throw new Error(
      'Microsoft Graph token response did not include an access token.',
    );
  }

  const ttlMs =
    typeof payload.expires_in === 'number' &&
    Number.isFinite(payload.expires_in) &&
    payload.expires_in > 0
      ? payload.expires_in * 1000
      : TOKEN_FALLBACK_TTL_MS;
  cachedToken = {
    key: cacheKey,
    token: payload.access_token,
    expiresAtMs: now() + ttlMs,
  };

  return payload.access_token;
}

export function resetMicrosoftGraphTokenCacheForTests(): void {
  cachedToken = null;
}
