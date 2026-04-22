import path from 'node:path';

import dotenv from 'dotenv';

const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '..', '..');

dotenv.config({ path: path.join(apiRoot, '.env'), override: false });
dotenv.config({ path: path.join(repoRoot, '.env'), override: false });

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

async function main() {
  const clientId = requiredEnv('MICROSOFT_GRAPH_CLIENT_ID');
  const tenantId = process.env.MICROSOFT_GRAPH_TENANT_ID?.trim() || 'consumers';
  const deviceCodeUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/devicecode`;
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;

  const scope =
    'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access openid profile';
  const deviceCodeResponse = await fetch(deviceCodeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope,
    }).toString(),
  });

  if (!deviceCodeResponse.ok) {
    throw new Error(`Device code request failed with status ${deviceCodeResponse.status}.`);
  }

  const deviceCodePayload = (await deviceCodeResponse.json()) as {
    device_code?: string;
    interval?: number;
    expires_in?: number;
    message?: string;
  };

  if (!deviceCodePayload.device_code || !deviceCodePayload.message) {
    throw new Error('Device code response was missing required fields.');
  }

  console.log(deviceCodePayload.message);

  const pollIntervalMs = Math.max((deviceCodePayload.interval ?? 5) * 1000, 1000);
  const expiresAt = Date.now() + (deviceCodePayload.expires_in ?? 900) * 1000;

  while (Date.now() < expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: deviceCodePayload.device_code,
      }).toString(),
    });

    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (tokenResponse.ok && tokenPayload.access_token && tokenPayload.refresh_token) {
      const meResponse = await fetch(
        'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName',
        {
          headers: {
            Authorization: `Bearer ${tokenPayload.access_token}`,
          },
        },
      );
      const mePayload = meResponse.ok ? await meResponse.json() : null;

      console.log('');
      console.log('Authenticated Microsoft account:');
      console.log(JSON.stringify(mePayload, null, 2));
      console.log('');
      console.log('Add this to apps/api/.env:');
      console.log(`MICROSOFT_GRAPH_REFRESH_TOKEN=${tokenPayload.refresh_token}`);
      return;
    }

    if (tokenPayload.error === 'authorization_pending') {
      continue;
    }

    if (tokenPayload.error === 'slow_down') {
      continue;
    }

    throw new Error(
      tokenPayload.error_description ||
        tokenPayload.error ||
        `Token polling failed with status ${tokenResponse.status}.`,
    );
  }

  throw new Error('Device code login expired before authorization completed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Device code flow failed.');
  process.exit(1);
});
