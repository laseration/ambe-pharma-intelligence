import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  AccountOpeningEmlPathError,
  resolveAccountOpeningEmlPath,
} from './importAccountOpeningEmlPath';

test('manual EML path resolver accepts absolute Windows paths unchanged', () => {
  const providedPath = 'D:\\Pilot Emails\\sanitized-message.eml';
  const result = resolveAccountOpeningEmlPath({
    providedPath,
    cwd: 'D:\\repo\\apps\\api',
    workspaceRoot: 'D:\\repo',
    pathExists: () => false,
  });

  assert.equal(result.providedPath, providedPath);
  assert.equal(result.resolvedPath, providedPath);
  assert.deepEqual(result.checkedPaths, [providedPath]);
});

test('manual EML path resolver prefers an existing cwd-relative path', () => {
  const cwd = path.resolve('repo/apps/api');
  const cwdRelativePath = path.join(cwd, 'fixtures', 'message.eml');
  const repoRelativePath = path.resolve('repo/fixtures/message.eml');
  const result = resolveAccountOpeningEmlPath({
    providedPath: 'fixtures/message.eml',
    cwd,
    workspaceRoot: path.resolve('repo'),
    pathExists: (filePath) => filePath === cwdRelativePath,
  });

  assert.equal(result.resolvedPath, cwdRelativePath);
  assert.deepEqual(result.checkedPaths, [cwdRelativePath, repoRelativePath]);
});

test('manual EML path resolver accepts repo-root-relative paths from apps/api cwd', () => {
  const workspaceRoot = path.resolve('repo');
  const cwd = path.join(workspaceRoot, 'apps', 'api');
  const repoRelativePath = path.join(
    workspaceRoot,
    'pilot-emails',
    'message.eml',
  );
  const result = resolveAccountOpeningEmlPath({
    providedPath: 'pilot-emails/message.eml',
    cwd,
    workspaceRoot,
    pathExists: (filePath) => filePath === repoRelativePath,
  });

  assert.equal(result.resolvedPath, repoRelativePath);
});

test('manual EML path error explains provided path, resolved path, cwd, and example', () => {
  const resolution = resolveAccountOpeningEmlPath({
    providedPath: 'path/to/sanitized-message.eml',
    cwd: path.resolve('repo/apps/api'),
    workspaceRoot: path.resolve('repo'),
    pathExists: () => false,
  });
  const error = new AccountOpeningEmlPathError(resolution);

  assert.match(
    error.message,
    /Manual account-opening \.eml import file was not found/,
  );
  assert.match(
    error.message,
    /Provided path: path\/to\/sanitized-message\.eml/,
  );
  assert.match(error.message, /Resolved path:/);
  assert.match(error.message, /Current working directory:/);
  assert.match(
    error.message,
    /pnpm --filter @ambe\/api account-opening:import-eml/,
  );
});
