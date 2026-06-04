import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLocalRuntimePilotBrowserSummary } from './localRuntimePilotBrowserServer';

test('local-runtime pilot browser summary exposes only safe database metadata', () => {
  const lines = buildLocalRuntimePilotBrowserSummary({
    database: {
      safe: true,
      classification: 'local',
      reason:
        'DATABASE_URL points at a loopback host and disposable database name.',
      host: '127.0.0.1',
      databaseName: 'ambe_local_browser_smoke',
    },
    integrations: {
      safe: true,
      unsafeReasons: [],
      checks: [
        {
          name: 'OpenAI parsing/review',
          safe: true,
          status: 'disabled',
          reason: 'OpenAI parser/review flags are disabled.',
        },
        {
          name: 'Telegram outbound',
          safe: true,
          status: 'dry-run',
          reason: 'Telegram dry-run is enabled.',
        },
      ],
    },
    migration: {
      command: 'pnpm',
      args: ['--filter', '@ambe/api', 'exec', 'prisma', 'migrate', 'deploy'],
      exitCode: 0,
    },
    seeded: true,
  });
  const output = lines.join('\n');

  assert.match(output, /Database host: 127\.0\.0\.1/);
  assert.match(output, /Database name: ambe_local_browser_smoke/);
  assert.match(output, /Database classification: local/);
  assert.match(output, /Database decision: safe/);
  assert.match(output, /Fake pilot seed: applied/);
  assert.match(output, /External services called: false/);
  assert.doesNotMatch(output, /postgresql:\/\//);
  assert.doesNotMatch(output, /password|secret|token=/i);
});
