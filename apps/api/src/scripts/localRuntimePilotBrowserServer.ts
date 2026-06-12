import { spawn } from 'node:child_process';
import type { Server } from 'node:http';
import path from 'node:path';

import { createApp } from '../app';
import { env } from '../config/env';
import {
  createEmailInboundPollingWorker,
  isEmailInboundPollingActive,
} from '../email/polling';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { configurePollingWorkerStatusStore } from '../polling/status';
import { createAppSettingPollingWorkerStatusStore } from '../polling/statusStore';
import { sanitizeSafeErrorMessage } from '../safety/redaction';
import { seedOperatorCommercialWorkflowE2e } from '../fixtures/e2e/operatorCommercialWorkflow';
import { verifyDatabaseReadiness } from '../startup/databaseHealth';
import {
  classifyDatabaseUrlForLocalSmoke,
  evaluateExternalIntegrationsForLocalSmoke,
  forceDisableExternalIntegrationsForLocalSmoke,
  type LocalSmokeDatabaseSafety,
  type LocalSmokeIntegrationSafety,
} from '../startup/localSmokeSafety';
import {
  createTelegramPollingWorker,
  isTelegramPollingActive,
} from '../telegram/polling';
import { seedPilotDemo } from './seedPilotDemo';

type CommandResult = {
  command: string;
  args: string[];
  exitCode: number;
};

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;

  while (current !== path.dirname(current)) {
    if (path.basename(current) === 'ambe-pharma-intelligence') {
      return current;
    }

    current = path.dirname(current);
  }

  return path.resolve(startDir, '../..');
}

function pnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function runWorkspaceCommand(args: string[]): Promise<CommandResult> {
  const workspaceRoot = findWorkspaceRoot(process.cwd());

  return new Promise((resolve, reject) => {
    const child = spawn(pnpmCommand(), args, {
      cwd: workspaceRoot,
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('close', (exitCode) => {
      resolve({
        command: 'pnpm',
        args,
        exitCode: exitCode ?? 1,
      });
    });
  });
}

export function buildLocalRuntimePilotBrowserSummary(input: {
  database: LocalSmokeDatabaseSafety;
  integrations: LocalSmokeIntegrationSafety;
  migration: CommandResult | null;
  seeded: boolean;
}): string[] {
  return [
    'AMBE local-runtime pilot browser smoke setup',
    `Database host: ${input.database.host ?? 'unknown'}`,
    `Database name: ${input.database.databaseName ?? 'unknown'}`,
    `Database classification: ${input.database.classification}`,
    `Database decision: ${input.database.safe ? 'safe' : 'refused'}`,
    'External integration checks:',
    ...input.integrations.checks.map(
      (check) => `- ${check.name}: ${check.status} (${check.reason})`,
    ),
    `Migration command: ${
      input.migration
        ? `${input.migration.command} ${input.migration.args.join(' ')} exited ${input.migration.exitCode}`
        : 'not run'
    }`,
    `Fake pilot seed: ${input.seeded ? 'applied' : 'not run'}`,
    'External services called: false',
  ];
}

function printSummary(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

function assertSafePreconditions(): {
  database: LocalSmokeDatabaseSafety;
  integrations: LocalSmokeIntegrationSafety;
} {
  const database = classifyDatabaseUrlForLocalSmoke(env.databaseUrl);

  if (!database.safe) {
    throw new Error(
      `Unsafe DATABASE_URL for browser smoke: ${database.reason}`,
    );
  }

  const integrations = evaluateExternalIntegrationsForLocalSmoke();

  if (!integrations.safe) {
    throw new Error(
      `Unsafe external integration config for browser smoke: ${integrations.unsafeReasons.join(' ')}`,
    );
  }

  return { database, integrations };
}

async function prepareDatabase(): Promise<{
  database: LocalSmokeDatabaseSafety;
  integrations: LocalSmokeIntegrationSafety;
  migration: CommandResult;
}> {
  const { database, integrations } = assertSafePreconditions();
  const migration = await runWorkspaceCommand([
    '--filter',
    '@ambe/api',
    'exec',
    'prisma',
    'migrate',
    'deploy',
  ]);

  if (migration.exitCode !== 0) {
    throw new Error(
      `Disposable database migration failed with exit code ${migration.exitCode}.`,
    );
  }

  await seedPilotDemo();
  await seedOperatorCommercialWorkflowE2e();

  printSummary(
    buildLocalRuntimePilotBrowserSummary({
      database,
      integrations,
      migration,
      seeded: true,
    }),
  );

  return { database, integrations, migration };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function runLocalRuntimePilotBrowserServer(): Promise<void> {
  forceDisableExternalIntegrationsForLocalSmoke();
  await prepareDatabase();
  await db.$connect();
  await verifyDatabaseReadiness();

  configurePollingWorkerStatusStore(
    createAppSettingPollingWorkerStatusStore(db),
  );
  const telegramPollingWorker = createTelegramPollingWorker();
  const emailInboundPollingWorker = createEmailInboundPollingWorker();
  const app = createApp();
  const server = app.listen(env.port, '127.0.0.1', () => {
    logger.info('Local-runtime pilot browser API started', {
      databaseHost: env.databaseHost,
      port: env.port,
      telegramPollingActive: isTelegramPollingActive(),
      emailPollingActive: isEmailInboundPollingActive(),
    });
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info('Local-runtime pilot browser API stopping', { signal });
    telegramPollingWorker.stop();
    emailInboundPollingWorker.stop();
    await closeServer(server);
    await db.$disconnect();
    process.exit(0);
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

if (require.main === module) {
  runLocalRuntimePilotBrowserServer().catch(async (error) => {
    console.error(`FAIL: ${sanitizeSafeErrorMessage(error)}`);
    await db.$disconnect();
    process.exit(1);
  });
}
