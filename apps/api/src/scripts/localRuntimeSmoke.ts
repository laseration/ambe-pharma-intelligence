import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createApp } from '../app';
import { env } from '../config/env';
import { db } from '../lib/db';
import { verifyDatabaseReadiness } from '../startup/databaseHealth';
import {
  classifyDatabaseUrlForLocalSmoke,
  evaluateExternalIntegrationsForLocalSmoke,
  forceDisableExternalIntegrationsForLocalSmoke,
} from '../startup/localSmokeSafety';
import { sanitizeSafeErrorMessage } from '../safety/redaction';

type EndpointCheck = {
  method: 'GET';
  path: string;
  status: number;
};

function waitForListening(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function checkGet(
  baseUrl: string,
  path: string,
  headers?: HeadersInit,
): Promise<EndpointCheck> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers,
  });

  return {
    method: 'GET',
    path,
    status: response.status,
  };
}

export function buildLocalRuntimeSmokeSummary(
  database: ReturnType<typeof classifyDatabaseUrlForLocalSmoke>,
  integrations: ReturnType<typeof evaluateExternalIntegrationsForLocalSmoke>,
  endpoints: EndpointCheck[],
): string[] {
  return [
    'AMBE local runtime smoke summary',
    `Database host: ${database.host ?? 'unknown'}`,
    `Database name: ${database.databaseName ?? 'unknown'}`,
    `Database classification: ${database.classification}`,
    `Database safety: ${database.reason}`,
    'External integration checks:',
    ...integrations.checks.map(
      (check) => `- ${check.name}: ${check.status} (${check.reason})`,
    ),
    'Endpoint checks:',
    ...endpoints.map(
      (endpoint) => `- ${endpoint.method} ${endpoint.path}: ${endpoint.status}`,
    ),
  ];
}

function printSafeSummary(
  database: ReturnType<typeof classifyDatabaseUrlForLocalSmoke>,
  integrations: ReturnType<typeof evaluateExternalIntegrationsForLocalSmoke>,
  endpoints: EndpointCheck[],
): void {
  for (const line of buildLocalRuntimeSmokeSummary(
    database,
    integrations,
    endpoints,
  )) {
    console.log(line);
  }
}

export async function runLocalRuntimeSmoke(): Promise<void> {
  const database = classifyDatabaseUrlForLocalSmoke(env.databaseUrl);

  if (!database.safe) {
    throw new Error(
      `Unsafe DATABASE_URL for local runtime smoke: ${database.reason}`,
    );
  }

  const integrations = evaluateExternalIntegrationsForLocalSmoke();

  if (!integrations.safe) {
    throw new Error(
      `Unsafe external integration config for local runtime smoke: ${integrations.unsafeReasons.join(' ')}`,
    );
  }

  const previousEnv = {
    internalApiKey: env.internalApiKey,
    internalAdminApiKey: env.internalAdminApiKey,
    enableDebugRoutes: env.enableDebugRoutes,
    openAiParserEnabled: env.openAiParserEnabled,
    openAiEmailReviewEnabled: env.openAiEmailReviewEnabled,
    telegramPollingEnabled: env.telegramPollingEnabled,
    telegramDryRun: env.telegramDryRun,
    emailAlertsEnabled: env.emailAlertsEnabled,
    emailInboundPollingEnabled: env.emailInboundPollingEnabled,
    sharePointAccountOpeningEnabled: env.sharePointAccountOpeningEnabled,
    oneDriveAccountOpeningEnabled: env.oneDriveAccountOpeningEnabled,
  };

  forceDisableExternalIntegrationsForLocalSmoke();

  const smokeOperatorKey = `local-smoke-${crypto.randomUUID()}`;
  const smokeAdminKey = `local-smoke-admin-${crypto.randomUUID()}`;

  env.internalApiKey = smokeOperatorKey;
  env.internalAdminApiKey = smokeAdminKey;
  env.enableDebugRoutes = true;

  const endpoints: EndpointCheck[] = [];
  let server: Server | null = null;

  try {
    await db.$connect();
    await verifyDatabaseReadiness();

    const app = createApp();
    server = app.listen(0, '127.0.0.1');
    await waitForListening(server);

    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    endpoints.push(await checkGet(baseUrl, '/health'));
    endpoints.push(
      await checkGet(baseUrl, '/api/debug/env', {
        'x-internal-api-key': smokeAdminKey,
        'x-internal-caller-name': 'local-runtime-smoke',
      }),
    );

    const failedEndpoint = endpoints.find((endpoint) => endpoint.status >= 400);

    if (failedEndpoint) {
      throw new Error(
        `Local runtime smoke endpoint failed: ${failedEndpoint.method} ${failedEndpoint.path} returned ${failedEndpoint.status}.`,
      );
    }

    printSafeSummary(database, integrations, endpoints);
  } finally {
    if (server) {
      await closeServer(server);
    }

    await db.$disconnect();
    Object.assign(env, previousEnv);
  }
}

if (require.main === module) {
  runLocalRuntimeSmoke().catch(async (error) => {
    console.error(`FAIL: ${sanitizeSafeErrorMessage(error)}`);
    await db.$disconnect();
    process.exit(1);
  });
}
