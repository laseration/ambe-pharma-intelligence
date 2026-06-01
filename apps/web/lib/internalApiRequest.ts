type InternalApiEnv = Record<string, string | undefined>;

type RequestInternalOptions = {
  callerName: string;
  init?: RequestInit;
  source?: InternalApiEnv;
  fetchImpl?: typeof fetch;
};

type RequestInternalFileOptions = RequestInternalOptions & {
  fallbackFileName: string;
  fallbackContentType: string;
};

type InternalTextFile = {
  fileName: string;
  contentType: string;
  content: string;
};

type InternalBinaryFile = {
  fileName: string;
  contentType: string;
  content: ArrayBuffer;
};

type ApiErrorPayload = {
  error?:
    | string
    | {
        message?: string;
        code?: string;
        requestId?: string;
        nextAction?: string;
      };
  code?: string;
  requestId?: string;
  nextAction?: string;
};

const DEFAULT_INTERNAL_API_BASE_URL = 'http://127.0.0.1:4000/api';
const REDACTED = '[redacted]';

export class InternalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
    readonly nextAction?: string,
  ) {
    super(message);
    this.name = 'InternalApiError';
  }
}

export function getInternalApiBaseUrl(
  source: InternalApiEnv = process.env,
): string {
  return (
    source.INTERNAL_API_BASE_URL?.trim() ||
    source.NEXT_PUBLIC_INTERNAL_API_BASE_URL?.trim() ||
    DEFAULT_INTERNAL_API_BASE_URL
  ).replace(/\/+$/, '');
}

function headersToRecord(
  headers: HeadersInit | undefined,
): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
}

export function buildInternalApiHeaders(input: {
  callerName: string;
  includeJsonContentType?: boolean;
  source?: InternalApiEnv;
  extraHeaders?: HeadersInit;
}): Record<string, string> {
  const source = input.source ?? process.env;
  const headers: Record<string, string> = {};
  const apiKey =
    source.INTERNAL_API_KEY?.trim() ||
    source.INTERNAL_ADMIN_API_KEY?.trim() ||
    '';

  if (apiKey) {
    headers['x-internal-api-key'] = apiKey;
    headers['x-internal-caller-name'] = input.callerName;
  }

  if (input.includeJsonContentType) {
    headers['content-type'] = 'application/json';
  }

  return {
    ...headers,
    ...headersToRecord(input.extraHeaders),
  };
}

function knownSecrets(source: InternalApiEnv): string[] {
  return [
    source.INTERNAL_API_KEY,
    source.INTERNAL_ADMIN_API_KEY,
    source.ACCOUNT_OPENING_EXPORT_DOWNLOAD_TOKEN,
    source.DASHBOARD_OPERATOR_TOKEN,
    source.WEB_AUTH_PASSWORD,
    source.WEB_AUTH_SESSION_SECRET,
  ]
    .map((value) => value?.trim() ?? '')
    .filter((value) => value.length >= 4);
}

export function redactInternalApiSecrets(
  value: string,
  source: InternalApiEnv = process.env,
): string {
  let redacted = value;

  for (const secret of knownSecrets(source)) {
    redacted = redacted.split(secret).join(REDACTED);
  }

  return redacted
    .replace(/(x-internal-api-key["':=\s]+)[^"',\s]+/gi, `$1${REDACTED}`)
    .replace(/(authorization["':=\s]+bearer\s+)[^"',\s]+/gi, `$1${REDACTED}`)
    .replace(/sk-[A-Za-z0-9_-]+/g, REDACTED)
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, REDACTED);
}

async function safeErrorMessage(
  response: Response,
  source: InternalApiEnv,
): Promise<{
  message: string;
  code?: string;
  requestId?: string;
  nextAction?: string;
}> {
  let message = `Request failed with status ${response.status}.`;
  let code: string | undefined;
  let requestId =
    response.headers.get('x-request-id') ??
    response.headers.get('x-correlation-id') ??
    undefined;
  let nextAction: string | undefined;

  try {
    const payload = (await response.json()) as ApiErrorPayload;

    if (typeof payload.error === 'string') {
      message = payload.error;
      code = payload.code;
      requestId = payload.requestId ?? requestId;
      nextAction = payload.nextAction;
    } else if (payload.error) {
      message = payload.error.message ?? message;
      code = payload.error.code;
      requestId = payload.error.requestId ?? requestId;
      nextAction = payload.error.nextAction;
    }
  } catch {
    // Keep the generic status-based message.
  }

  return {
    message: redactInternalApiSecrets(message, source),
    code,
    requestId,
    nextAction: nextAction
      ? redactInternalApiSecrets(nextAction, source)
      : undefined,
  };
}

function buildInternalApiError(
  response: Response,
  safeError: Awaited<ReturnType<typeof safeErrorMessage>>,
): InternalApiError {
  const diagnosticParts = [
    safeError.requestId ? `Request ID: ${safeError.requestId}` : null,
    safeError.nextAction ? `What to check next: ${safeError.nextAction}` : null,
  ].filter((value): value is string => Boolean(value));
  const message =
    diagnosticParts.length > 0
      ? `${safeError.message} ${diagnosticParts.join(' ')}`
      : safeError.message;

  return new InternalApiError(
    message,
    response.status,
    safeError.code,
    safeError.requestId,
    safeError.nextAction,
  );
}

function buildUrl(path: string, source: InternalApiEnv): string {
  return `${getInternalApiBaseUrl(source)}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function requestInternalJson<T>(
  path: string,
  options: RequestInternalOptions,
): Promise<T> {
  const source = options.source ?? process.env;
  const init = options.init;
  const response = await (options.fetchImpl ?? fetch)(buildUrl(path, source), {
    ...init,
    cache: 'no-store',
    headers: buildInternalApiHeaders({
      callerName: options.callerName,
      includeJsonContentType: init?.body !== undefined,
      source,
      extraHeaders: init?.headers,
    }),
  });

  if (!response.ok) {
    throw buildInternalApiError(response, await safeErrorMessage(response, source));
  }

  return (await response.json()) as T;
}

function fileNameFromDisposition(
  disposition: string,
  fallback: string,
): string {
  const fileNameMatch = /filename="([^"]+)"/i.exec(disposition);

  return fileNameMatch?.[1] ?? fallback;
}

export async function requestInternalTextFile(
  path: string,
  options: RequestInternalFileOptions,
): Promise<InternalTextFile> {
  const source = options.source ?? process.env;
  const init = options.init;
  const response = await (options.fetchImpl ?? fetch)(buildUrl(path, source), {
    ...init,
    cache: 'no-store',
    headers: buildInternalApiHeaders({
      callerName: options.callerName,
      source,
      extraHeaders: init?.headers,
    }),
  });

  if (!response.ok) {
    throw buildInternalApiError(response, await safeErrorMessage(response, source));
  }

  return {
    fileName: fileNameFromDisposition(
      response.headers.get('content-disposition') ?? '',
      options.fallbackFileName,
    ),
    contentType:
      response.headers.get('content-type') ?? options.fallbackContentType,
    content: await response.text(),
  };
}

export async function requestInternalBinaryFile(
  path: string,
  options: RequestInternalFileOptions,
): Promise<InternalBinaryFile> {
  const source = options.source ?? process.env;
  const init = options.init;
  const response = await (options.fetchImpl ?? fetch)(buildUrl(path, source), {
    ...init,
    cache: 'no-store',
    headers: buildInternalApiHeaders({
      callerName: options.callerName,
      source,
      extraHeaders: init?.headers,
    }),
  });

  if (!response.ok) {
    throw buildInternalApiError(response, await safeErrorMessage(response, source));
  }

  return {
    fileName: fileNameFromDisposition(
      response.headers.get('content-disposition') ?? '',
      options.fallbackFileName,
    ),
    contentType:
      response.headers.get('content-type') ?? options.fallbackContentType,
    content: await response.arrayBuffer(),
  };
}
