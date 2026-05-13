import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMicrosoftDriveAccessCheckConfig,
  getDiagnosticFolderChecks,
  getHealthCheckFolderPath,
  isWriteTestEnabled,
  redactSensitiveLogText,
  validateMicrosoftDriveAccessCheckConfig,
} from './checkMicrosoftDriveAccess';

test('redacts Microsoft client secrets and access tokens from Microsoft Drive diagnostic output', () => {
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

test('SharePoint Microsoft Drive diagnostic requires existing SharePoint env vars', () => {
  const missing = validateMicrosoftDriveAccessCheckConfig({
    provider: 'SHAREPOINT',
    accountOpeningEnabled: false,
    tenantId: '',
    clientId: '',
    clientSecret: '',
    credentialSource: 'missing',
    sharePointSiteId: '',
    sharePointDriveId: '',
    oneDriveUserId: '',
    oneDriveDriveId: '',
    rootFolder: '',
    accountOpeningFolder: '',
  });

  assert.deepEqual(missing, [
    'Missing Microsoft storage credentials. Set MICROSOFT_STORAGE_TENANT_ID, MICROSOFT_STORAGE_CLIENT_ID, MICROSOFT_STORAGE_CLIENT_SECRET.',
    'SHAREPOINT_SITE_ID',
    'SHAREPOINT_DRIVE_ID',
    'SHAREPOINT_ACCOUNT_OPENING_FOLDER',
  ]);
});

test('OneDrive Microsoft Drive diagnostic accepts drive ID without user ID', () => {
  const missing = validateMicrosoftDriveAccessCheckConfig({
    provider: 'ONEDRIVE',
    accountOpeningEnabled: true,
    tenantId: 'tenant-id',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    credentialSource: 'storage-specific',
    sharePointSiteId: '',
    sharePointDriveId: '',
    oneDriveUserId: '',
    oneDriveDriveId: 'drive-id',
    rootFolder: 'AI BOT FOLDER',
    accountOpeningFolder: 'AI BOT FOLDER/Account Opening',
  });

  assert.deepEqual(missing, []);
});

test('OneDrive Microsoft Drive diagnostic can resolve drive from user ID', () => {
  const missing = validateMicrosoftDriveAccessCheckConfig({
    provider: 'ONEDRIVE',
    accountOpeningEnabled: true,
    tenantId: 'tenant-id',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    credentialSource: 'storage-specific',
    sharePointSiteId: '',
    sharePointDriveId: '',
    oneDriveUserId: 'sandeep@example.com',
    oneDriveDriveId: '',
    rootFolder: 'AI BOT FOLDER',
    accountOpeningFolder: 'AI BOT FOLDER/Account Opening',
  });

  assert.deepEqual(missing, []);
});

test('Microsoft Drive diagnostic write test is disabled by default', () => {
  assert.equal(isWriteTestEnabled(['node', 'script.ts']), false);
  assert.equal(isWriteTestEnabled(['node', 'script.ts', '--write-test']), true);
});

test('Microsoft Drive diagnostic checks root and Account Opening folders', () => {
  const folders = getDiagnosticFolderChecks({
    provider: 'ONEDRIVE',
    accountOpeningEnabled: true,
    tenantId: 'tenant-id',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    credentialSource: 'storage-specific',
    sharePointSiteId: '',
    sharePointDriveId: '',
    oneDriveUserId: 'sandeep@example.com',
    oneDriveDriveId: '',
    rootFolder: 'AI BOT FOLDER',
    accountOpeningFolder: 'AI BOT FOLDER/Account Opening',
  });

  assert.deepEqual(folders, [
    { label: 'root folder', path: 'AI BOT FOLDER' },
    { label: 'Account Opening folder', path: 'AI BOT FOLDER/Account Opening' },
  ]);
});

test('Microsoft Drive diagnostic write test uses root Health Checks folder', () => {
  assert.equal(
    getHealthCheckFolderPath({ rootFolder: 'AI BOT FOLDER' }),
    'AI BOT FOLDER/Health Checks',
  );
});

test('Microsoft Drive diagnostic uses storage-specific credentials when present', () => {
  const config = buildMicrosoftDriveAccessCheckConfig({
    accountOpeningStorageProvider: 'SHAREPOINT',
    sharePointAccountOpeningEnabled: true,
    oneDriveAccountOpeningEnabled: false,
    microsoftStorageTenantId: 'storage-tenant',
    microsoftStorageClientId: 'storage-client',
    microsoftStorageClientSecret: 'storage-secret',
    microsoftStorageCredentialSource: 'storage-specific',
    sharePointSiteId: 'site-id',
    sharePointDriveId: 'drive-id',
    oneDriveUserId: '',
    oneDriveDriveId: '',
    microsoftDriveRootFolder: 'AI BOT FOLDER',
    sharePointAccountOpeningFolder: 'AI BOT FOLDER/Account Opening',
    oneDriveAccountOpeningFolder: 'AI BOT FOLDER/Account Opening',
  });

  assert.equal(config.tenantId, 'storage-tenant');
  assert.equal(config.clientId, 'storage-client');
  assert.equal(config.clientSecret, 'storage-secret');
  assert.equal(config.credentialSource, 'storage-specific');
});

test('Microsoft Drive diagnostic keeps generic fallback credential source', () => {
  const config = buildMicrosoftDriveAccessCheckConfig({
    accountOpeningStorageProvider: 'SHAREPOINT',
    sharePointAccountOpeningEnabled: true,
    oneDriveAccountOpeningEnabled: false,
    microsoftStorageTenantId: 'generic-tenant',
    microsoftStorageClientId: 'generic-client',
    microsoftStorageClientSecret: 'generic-secret',
    microsoftStorageCredentialSource: 'generic-fallback',
    sharePointSiteId: 'site-id',
    sharePointDriveId: 'drive-id',
    oneDriveUserId: '',
    oneDriveDriveId: '',
    microsoftDriveRootFolder: 'AI BOT FOLDER',
    sharePointAccountOpeningFolder: 'AI BOT FOLDER/Account Opening',
    oneDriveAccountOpeningFolder: 'AI BOT FOLDER/Account Opening',
  });

  assert.equal(config.tenantId, 'generic-tenant');
  assert.equal(config.clientId, 'generic-client');
  assert.equal(config.clientSecret, 'generic-secret');
  assert.equal(config.credentialSource, 'generic-fallback');
});
