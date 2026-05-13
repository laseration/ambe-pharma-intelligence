import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMicrosoftDriveWorkflowFolder,
  resolveMicrosoftMailGraphCredentials,
  resolveMicrosoftStorageGraphCredentials,
} from './env';

test('derives account-opening folder from Microsoft Drive root folder', () => {
  assert.equal(
    buildMicrosoftDriveWorkflowFolder('AI BOT FOLDER', '', 'Account Opening'),
    'AI BOT FOLDER/Account Opening',
  );
});

test('explicit account-opening folder overrides Microsoft Drive root derivation', () => {
  assert.equal(
    buildMicrosoftDriveWorkflowFolder(
      'AI BOT FOLDER',
      'Custom Root/Custom Account Opening',
      'Account Opening',
    ),
    'Custom Root/Custom Account Opening',
  );
});

test('mail credentials prefer mail-specific vars over legacy Graph mail vars', () => {
  const credentials = resolveMicrosoftMailGraphCredentials({
    MICROSOFT_MAIL_TENANT_ID: 'mail-tenant',
    MICROSOFT_MAIL_CLIENT_ID: 'mail-client',
    MICROSOFT_MAIL_CLIENT_SECRET: 'mail-secret',
    MICROSOFT_GRAPH_TENANT_ID: 'graph-tenant',
    MICROSOFT_GRAPH_CLIENT_ID: 'graph-client',
    MICROSOFT_GRAPH_CLIENT_SECRET: 'graph-secret',
    MICROSOFT_STORAGE_TENANT_ID: 'storage-tenant',
    MICROSOFT_STORAGE_CLIENT_ID: 'storage-client',
    MICROSOFT_STORAGE_CLIENT_SECRET: 'storage-secret',
  });

  assert.deepEqual(credentials, {
    tenantId: 'mail-tenant',
    clientId: 'mail-client',
    clientSecret: 'mail-secret',
    source: 'mail-specific',
  });
});

test('mail credentials fall back to legacy Graph mail vars but not storage vars', () => {
  const credentials = resolveMicrosoftMailGraphCredentials({
    MICROSOFT_GRAPH_TENANT_ID: 'graph-tenant',
    MICROSOFT_GRAPH_CLIENT_ID: 'graph-client',
    MICROSOFT_GRAPH_CLIENT_SECRET: 'graph-secret',
    MICROSOFT_STORAGE_TENANT_ID: 'storage-tenant',
    MICROSOFT_STORAGE_CLIENT_ID: 'storage-client',
    MICROSOFT_STORAGE_CLIENT_SECRET: 'storage-secret',
  });

  assert.deepEqual(credentials, {
    tenantId: 'graph-tenant',
    clientId: 'graph-client',
    clientSecret: 'graph-secret',
    source: 'legacy-graph',
  });
});

test('storage credentials prefer storage-specific vars over generic fallback and mail vars', () => {
  const credentials = resolveMicrosoftStorageGraphCredentials({
    MICROSOFT_STORAGE_TENANT_ID: 'storage-tenant',
    MICROSOFT_STORAGE_CLIENT_ID: 'storage-client',
    MICROSOFT_STORAGE_CLIENT_SECRET: 'storage-secret',
    MICROSOFT_TENANT_ID: 'generic-tenant',
    MICROSOFT_CLIENT_ID: 'generic-client',
    MICROSOFT_CLIENT_SECRET: 'generic-secret',
    MICROSOFT_MAIL_TENANT_ID: 'mail-tenant',
    MICROSOFT_MAIL_CLIENT_ID: 'mail-client',
    MICROSOFT_MAIL_CLIENT_SECRET: 'mail-secret',
  });

  assert.deepEqual(credentials, {
    tenantId: 'storage-tenant',
    clientId: 'storage-client',
    clientSecret: 'storage-secret',
    source: 'storage-specific',
  });
});

test('storage credentials fall back to generic vars but not mail vars', () => {
  const credentials = resolveMicrosoftStorageGraphCredentials({
    MICROSOFT_TENANT_ID: 'generic-tenant',
    MICROSOFT_CLIENT_ID: 'generic-client',
    MICROSOFT_CLIENT_SECRET: 'generic-secret',
    MICROSOFT_MAIL_TENANT_ID: 'mail-tenant',
    MICROSOFT_MAIL_CLIENT_ID: 'mail-client',
    MICROSOFT_MAIL_CLIENT_SECRET: 'mail-secret',
  });

  assert.deepEqual(credentials, {
    tenantId: 'generic-tenant',
    clientId: 'generic-client',
    clientSecret: 'generic-secret',
    source: 'generic-fallback',
  });
});
