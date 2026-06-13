import {
  getWebSessionCookieOptions,
  verifyWebLogin,
  WEB_AUTH_COOKIE_NAME,
} from './internalWebAuth';

type WebAuthEnv = Record<string, string | undefined>;

export type WebAuthCookieWrite = {
  name: typeof WEB_AUTH_COOKIE_NAME;
  value: string;
  options: ReturnType<typeof getWebSessionCookieOptions>;
};

export type WebLoginFlowResult =
  | {
      authenticated: true;
      redirectTo: string;
      cookie: WebAuthCookieWrite;
    }
  | {
      authenticated: false;
      redirectTo: string;
      cookie: null;
    };

export function normalizeDashboardRedirect(value: string | undefined): string {
  if (
    value === '/dashboard' ||
    value?.startsWith('/dashboard/') ||
    value?.startsWith('/dashboard?')
  ) {
    return value;
  }

  return '/dashboard';
}

function buildLoginRedirect(
  error: 'invalid' | 'not-configured',
  next: string,
): string {
  const searchParams = new URLSearchParams({
    error,
    next,
  });

  return `/login?${searchParams.toString()}`;
}

export async function prepareWebLogin(input: {
  username: string;
  password: string;
  next?: string;
  source?: WebAuthEnv;
  now?: number;
}): Promise<WebLoginFlowResult> {
  const next = normalizeDashboardRedirect(input.next);
  const now = input.now ?? Date.now();
  const result = await verifyWebLogin({
    username: input.username,
    password: input.password,
    source: input.source,
    now,
  });

  if (!result.authenticated) {
    return {
      authenticated: false,
      redirectTo: buildLoginRedirect(result.reason, next),
      cookie: null,
    };
  }

  return {
    authenticated: true,
    redirectTo: next,
    cookie: {
      name: WEB_AUTH_COOKIE_NAME,
      value: result.cookieValue,
      options: getWebSessionCookieOptions({
        source: input.source,
        maxAge: result.session.expiresAt - Math.floor(now / 1000),
      }),
    },
  };
}

export function prepareWebLogout(input?: { source?: WebAuthEnv }): {
  redirectTo: string;
  cookie: WebAuthCookieWrite;
} {
  return {
    redirectTo: '/login?signedOut=1',
    cookie: {
      name: WEB_AUTH_COOKIE_NAME,
      value: '',
      options: getWebSessionCookieOptions({
        source: input?.source,
        maxAge: 0,
      }),
    },
  };
}
