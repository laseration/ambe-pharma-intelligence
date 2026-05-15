import { timingSafeEqual } from 'node:crypto';

export type AccountOpeningDownloadAuthResult =
  | { authorized: true }
  | { authorized: false; status: 401 | 403; error: string };

const DOWNLOAD_TOKEN_COOKIE = 'account_opening_export_token';

function configuredDownloadToken(): string {
  return (
    process.env.ACCOUNT_OPENING_EXPORT_DOWNLOAD_TOKEN?.trim() ||
    process.env.DASHBOARD_OPERATOR_TOKEN?.trim() ||
    ''
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function cookieValue(cookieHeader: string | null, name: string): string {
  if (!cookieHeader) {
    return '';
  }

  const prefix = `${name}=`;
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)).trim() : '';
}

function bearerToken(authorizationHeader: string | null): string {
  const trimmed = authorizationHeader?.trim() ?? '';

  if (!trimmed.toLowerCase().startsWith('bearer ')) {
    return '';
  }

  return trimmed.slice('bearer '.length).trim();
}

export function requireAccountOpeningDownloadAccess(
  request: Request,
): AccountOpeningDownloadAuthResult {
  const configuredToken = configuredDownloadToken();

  if (!configuredToken) {
    return {
      authorized: false,
      status: 403,
      error:
        'Account-opening review downloads are disabled until ACCOUNT_OPENING_EXPORT_DOWNLOAD_TOKEN is configured.',
    };
  }

  const providedToken =
    request.headers.get('x-account-opening-export-token')?.trim() ||
    bearerToken(request.headers.get('authorization')) ||
    cookieValue(request.headers.get('cookie'), DOWNLOAD_TOKEN_COOKIE);

  if (!providedToken || !constantTimeEqual(providedToken, configuredToken)) {
    return {
      authorized: false,
      status: 401,
      error: 'Account-opening review download token is required.',
    };
  }

  return { authorized: true };
}
