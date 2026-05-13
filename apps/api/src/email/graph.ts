import { env } from '../config/env';

export function isMicrosoftGraphConfigured(): boolean {
  return Boolean(
    env.microsoftMailTenantId &&
      env.microsoftMailClientId &&
      (env.microsoftMailClientSecret || env.microsoftGraphRefreshToken) &&
      env.microsoftGraphSenderMailbox,
  );
}

export async function getMicrosoftGraphAccessToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(env.microsoftMailTenantId)}/oauth2/v2.0/token`;
  const tokenBody = new URLSearchParams(
    env.microsoftGraphRefreshToken
      ? {
          client_id: env.microsoftMailClientId,
          refresh_token: env.microsoftGraphRefreshToken,
          scope: 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access',
          grant_type: 'refresh_token',
        }
      : {
          client_id: env.microsoftMailClientId,
          client_secret: env.microsoftMailClientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        },
  );
  const response = await fetch(tokenUrl, {
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
  };

  if (!payload.access_token) {
    throw new Error('Microsoft Graph token response did not include an access token.');
  }

  return payload.access_token;
}
