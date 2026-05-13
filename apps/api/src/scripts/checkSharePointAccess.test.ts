import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSharePointAccessCheckConfig,
  redactSensitiveLogText,
  validateSharePointAccessCheckConfig,
} from './checkSharePointAccess';

test('redacts Microsoft client secrets and access tokens from diagnostic output', () => {
  const clientSecret = 'super-secret-client-value';
  const accessToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.payload.signature';
  const text = [
    `client_secret=${clientSecret}&scope=https://graph.microsoft.com/.default`,
    `Authorization: Bearer ${accessToken}`,
    JSON.stringify({ access_token: accessToken }),
  ].join('\n');

  const redacted = redactSensitiveLogText(text, [clientSecret]);

  assert.doesNotMatch(redacted, new RegExp(clientSecret));
  assert.doesNotMatch(redacted, new RegExp(accessToken.replace(/\./g, '\\.')));
  assert.match(redacted, /client_secret=\[redacted\]/);
  assert.match(redacted, /Bearer \[redacted\]/);
  assert.match(redacted, /"access_token":"\[redacted\]"/);
});

test('missing SharePoint diagnostic env vars produce clear names', () => {
  const missing = validateSharePointAccessCheckConfig({
    accountOpeningEnabled: false,
    tenantId: '',
    clientId: '',
    clientSecret: '',
    credentialSource: 'missing',
    siteId: '',
    driveId: '',
    accountOpeningFolder: '',
  });

  assert.deepEqual(missing, [
    'Missing Microsoft storage credentials. Set MICROSOFT_STORAGE_TENANT_ID, MICROSOFT_STORAGE_CLIENT_ID, MICROSOFT_STORAGE_CLIENT_SECRET.',
    'SHAREPOINT_SITE_ID',
    'SHAREPOINT_DRIVE_ID',
    'SHAREPOINT_ACCOUNT_OPENING_FOLDER',
  ]);
});

test('present SharePoint diagnostic env vars pass validation', () => {
  const missing = validateSharePointAccessCheckConfig({
    accountOpeningEnabled: true,
    tenantId: 'tenant-id',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    credentialSource: 'storage-specific',
    siteId: 'site-id',
    driveId: 'drive-id',
    accountOpeningFolder: 'Account Opening',
  });

  assert.deepEqual(missing, []);
});

test('SharePoint diagnostic reads storage-specific credentials from env config', () => {
  const config = buildSharePointAccessCheckConfig({
    sharePointAccountOpeningEnabled: true,
    microsoftStorageTenantId: 'storage-tenant',
    microsoftStorageClientId: 'storage-client',
    microsoftStorageClientSecret: 'storage-secret',
    microsoftStorageCredentialSource: 'storage-specific',
    sharePointSiteId: 'site-id',
    sharePointDriveId: 'drive-id',
    sharePointAccountOpeningFolder: 'AI BOT FOLDER/Account Opening',
  });

  assert.equal(config.tenantId, 'storage-tenant');
  assert.equal(config.clientId, 'storage-client');
  assert.equal(config.clientSecret, 'storage-secret');
  assert.equal(config.credentialSource, 'storage-specific');
});

test('SharePoint diagnostic preserves generic fallback credential source', () => {
  const config = buildSharePointAccessCheckConfig({
    sharePointAccountOpeningEnabled: true,
    microsoftStorageTenantId: 'generic-tenant',
    microsoftStorageClientId: 'generic-client',
    microsoftStorageClientSecret: 'generic-secret',
    microsoftStorageCredentialSource: 'generic-fallback',
    sharePointSiteId: 'site-id',
    sharePointDriveId: 'drive-id',
    sharePointAccountOpeningFolder: 'AI BOT FOLDER/Account Opening',
  });

  assert.equal(config.tenantId, 'generic-tenant');
  assert.equal(config.clientId, 'generic-client');
  assert.equal(config.clientSecret, 'generic-secret');
  assert.equal(config.credentialSource, 'generic-fallback');
});
