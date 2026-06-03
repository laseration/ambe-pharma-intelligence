import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLocalRuntimeSmokeSummary } from './localRuntimeSmoke';

test('local runtime smoke summary exposes DB classification without credentials', () => {
  const lines = buildLocalRuntimeSmokeSummary(
    {
      safe: true,
      classification: 'local',
      reason:
        'DATABASE_URL points at a loopback host and disposable database name.',
      host: 'localhost',
      databaseName: 'ambe_ci',
    },
    {
      safe: true,
      unsafeReasons: [],
      checks: [
        {
          name: 'OpenAI parsing/review',
          safe: true,
          status: 'present-disabled',
          reason: 'OpenAI key is present but parser/review flags are disabled.',
        },
        {
          name: 'Telegram outbound',
          safe: true,
          status: 'dry-run',
          reason: 'Telegram dry-run is enabled.',
        },
      ],
    },
    [
      {
        method: 'GET',
        path: '/health',
        status: 200,
      },
    ],
  );
  const output = lines.join('\n');

  assert.match(output, /Database host: localhost/);
  assert.match(output, /Database name: ambe_ci/);
  assert.match(output, /Database classification: local/);
  assert.match(output, /Endpoint checks/);
  assert.doesNotMatch(output, /postgresql:\/\//);
  assert.doesNotMatch(output, /password|secret|token=/i);
});
