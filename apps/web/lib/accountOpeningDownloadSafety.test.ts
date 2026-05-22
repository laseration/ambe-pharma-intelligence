import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { requireAccountOpeningDownloadAccess } from './accountOpeningDownloadAuth';
import {
  classifyAccountOpeningDownloadFileName,
  isAllowedAccountOpeningDownloadFileName,
  safeAccountOpeningDownloadFileName,
} from './accountOpeningDownloadFiles';

function overrideEnv(context: TestContext, overrides: NodeJS.ProcessEnv): void {
  const snapshot = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, process.env[key]]),
  );

  Object.assign(process.env, overrides);
  context.after(() => {
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test('account-opening download auth rejects when download token is not configured', (t) => {
  overrideEnv(t, {
    ACCOUNT_OPENING_EXPORT_DOWNLOAD_TOKEN: '',
    DASHBOARD_OPERATOR_TOKEN: '',
  });

  const request = new Request('https://dashboard.example.test/download');
  const result = requireAccountOpeningDownloadAccess(request);

  assert.deepEqual(result, {
    authorized: false,
    status: 403,
    error:
      'Account-opening review downloads are disabled until ACCOUNT_OPENING_EXPORT_DOWNLOAD_TOKEN is configured.',
  });
});

test('account-opening download auth accepts header bearer and cookie tokens', (t) => {
  overrideEnv(t, {
    ACCOUNT_OPENING_EXPORT_DOWNLOAD_TOKEN: 'download-token-redacted',
    DASHBOARD_OPERATOR_TOKEN: '',
  });

  assert.deepEqual(
    requireAccountOpeningDownloadAccess(
      new Request('https://dashboard.example.test/download', {
        headers: {
          'x-account-opening-export-token': 'download-token-redacted',
        },
      }),
    ),
    { authorized: true },
  );
  assert.deepEqual(
    requireAccountOpeningDownloadAccess(
      new Request('https://dashboard.example.test/download', {
        headers: {
          authorization: 'Bearer download-token-redacted',
        },
      }),
    ),
    { authorized: true },
  );
  assert.deepEqual(
    requireAccountOpeningDownloadAccess(
      new Request('https://dashboard.example.test/download', {
        headers: {
          cookie:
            'theme=light; account_opening_export_token=download-token-redacted',
        },
      }),
    ),
    { authorized: true },
  );
});

test('account-opening download auth rejects missing or invalid tokens without echoing configured token', (t) => {
  overrideEnv(t, {
    ACCOUNT_OPENING_EXPORT_DOWNLOAD_TOKEN: 'download-token-redacted',
    DASHBOARD_OPERATOR_TOKEN: '',
  });

  const result = requireAccountOpeningDownloadAccess(
    new Request('https://dashboard.example.test/download', {
      headers: {
        'x-account-opening-export-token': 'wrong-token',
      },
    }),
  );

  assert.equal(result.authorized, false);
  assert.equal(result.status, 401);
  assert.doesNotMatch(result.error, /download-token-redacted/);
});

test('account-opening download filename allowlist blocks traversal and unknown files', () => {
  assert.equal(isAllowedAccountOpeningDownloadFileName('review-pack.md'), true);
  assert.equal(
    classifyAccountOpeningDownloadFileName('binary-fill-preview.pdf'),
    'binary-fill-preview',
  );
  assert.equal(
    classifyAccountOpeningDownloadFileName('original-form-reference.json'),
    'fill-preview',
  );

  for (const fileName of [
    '../review-pack.md',
    '..\\review-pack.md',
    'review-pack.md.exe',
    'source-evidence.json?token=secret',
    'bank-details.json',
  ]) {
    assert.equal(isAllowedAccountOpeningDownloadFileName(fileName), false);
    assert.equal(
      safeAccountOpeningDownloadFileName(fileName),
      'account-opening-review.txt',
    );
  }
});
