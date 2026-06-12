import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSetupChecklistSections,
  countSetupSectionsByStatus,
  formatSetupDetailValue,
} from './setupChecklist';
import type { WebAuthSession } from './internalWebAuth';
import type { SystemReadinessCheck, SystemReadinessReport } from './systemApi';

function check(input: Partial<SystemReadinessCheck>): SystemReadinessCheck {
  return {
    key: input.key ?? 'missing-key',
    title: input.title ?? 'Missing key',
    status: input.status ?? 'ready',
    meaning: input.meaning ?? 'Safe readiness meaning.',
    nextAction: input.nextAction ?? 'Safe next action.',
    envVars: input.envVars ?? [],
    documentationPath: input.documentationPath,
    details: input.details ?? {},
  };
}

const adminSession: WebAuthSession = {
  username: 'pilot.admin',
  role: 'admin',
  expiresAt: 2_000_000_000,
};

test('setup checklist builds the required grouped pilot sections', () => {
  const report: SystemReadinessReport = {
    generatedAt: '2026-06-02T12:00:00.000Z',
    status: 'warning',
    checks: [
      check({ key: 'database', title: 'Database', status: 'ready' }),
      check({
        key: 'api-internal-auth',
        title: 'API Internal Auth',
        status: 'ready',
      }),
      check({
        key: 'microsoft-mail',
        title: 'Microsoft Mail',
        status: 'missing',
      }),
      check({
        key: 'graph-mail-preflight',
        title: 'Graph Inbox Preflight',
        status: 'missing',
        details: {
          dryRunSafe: false,
          allowedSenderCount: 0,
          supplierMappingCount: 0,
        },
      }),
      check({
        key: 'email-polling',
        title: 'Email Inbox Polling',
        status: 'disabled',
        details: {
          graphConfigured: false,
          enabled: false,
          active: false,
          runtimeRunning: false,
        },
      }),
      check({
        key: 'allowed-senders-supplier-mappings',
        title: 'Allowed Senders',
        status: 'missing',
      }),
      check({
        key: 'microsoft-storage',
        title: 'Microsoft Storage',
        status: 'disabled',
      }),
      check({ key: 'telegram', title: 'Telegram', status: 'disabled' }),
      check({
        key: 'openai-parser',
        title: 'OpenAI Parser',
        status: 'disabled',
      }),
      check({ key: 'imports', title: 'Imports', status: 'ready' }),
      check({
        key: 'demo-seed-safety',
        title: 'Demo Seed Safety',
        status: 'warning',
      }),
      check({
        key: 'production-safety-warnings',
        title: 'Production Safety',
        status: 'warning',
      }),
    ],
  };

  const sections = buildSetupChecklistSections({
    report,
    session: adminSession,
    source: {
      WEB_AUTH_USERNAME: 'pilot.admin',
      WEB_AUTH_PASSWORD: 'safe-test-password',
      WEB_AUTH_ROLE: 'admin',
      WEB_AUTH_SESSION_SECRET: 'x'.repeat(32),
      WEB_AUTH_SESSION_TTL_SECONDS: '28800',
    },
  });

  assert.deepEqual(
    sections.map((section) => section.title),
    [
      'Database/API',
      'Internal API Auth',
      'Web Auth/Session',
      'Microsoft Graph Inbox Polling',
      'Allowed Senders/Supplier Mappings',
      'Microsoft Storage',
      'Telegram Intake',
      'OpenAI/AI Fallback Policy',
      'Import Availability',
      'Demo/Seed Safety',
      'Production Safety Warnings',
    ],
  );

  assert.equal(
    sections.find((section) => section.key === 'web-auth-session')?.status,
    'ready',
  );
  assert.equal(
    sections.find((section) => section.key === 'microsoft-graph-inbox-polling')
      ?.status,
    'disabled',
  );
  assert.deepEqual(countSetupSectionsByStatus(sections), {
    ready: 4,
    warning: 2,
    missing: 1,
    disabled: 4,
  });
});

test('setup checklist redacts secret-like values before UI rendering', () => {
  const report: SystemReadinessReport = {
    generatedAt: '2026-06-02T12:00:00.000Z',
    status: 'warning',
    checks: [
      check({
        key: 'database',
        title: 'Database',
        status: 'warning',
        details: {
          configured: true,
          lastError:
            'postgresql://user:pass@db.example.test/ambe and sk-live-testsecret',
          warnings: ['token=secret-token-value', 'operator@example.test'],
        },
      }),
    ],
  };

  const sections = buildSetupChecklistSections({
    report,
    session: null,
    source: {},
  });
  const serialized = JSON.stringify(sections);

  assert.doesNotMatch(serialized, /postgresql:\/\//);
  assert.doesNotMatch(serialized, /user:pass/);
  assert.doesNotMatch(serialized, /sk-live-testsecret/);
  assert.doesNotMatch(serialized, /secret-token-value/);
  assert.doesNotMatch(serialized, /operator@example\.test/);
  assert.match(serialized, /\[redacted\]/);
});

test('setup detail formatter redacts values defensively', () => {
  assert.equal(formatSetupDetailValue(true), 'yes');
  assert.equal(formatSetupDetailValue(false), 'no');
  assert.equal(formatSetupDetailValue(null), 'n/a');
  assert.equal(formatSetupDetailValue([]), 'none');
  assert.equal(
    formatSetupDetailValue([
      'postgresql://user:pass@db.example.test/ambe',
      'owner@example.test',
    ]),
    '[redacted], [redacted]',
  );
});
