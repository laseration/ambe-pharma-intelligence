'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  getWebSessionCookieOptions,
  verifyWebLogin,
  WEB_AUTH_COOKIE_NAME,
} from '../../lib/internalWebAuth';

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === 'string' ? value : '';
}

function normalizeDashboardRedirect(value: string): string {
  if (value.startsWith('/dashboard')) {
    return value;
  }

  return '/dashboard';
}

function loginRedirect(error: 'invalid' | 'not-configured', next: string): never {
  const searchParams = new URLSearchParams({
    error,
    next,
  });

  redirect(`/?${searchParams.toString()}`);
}

export async function loginAction(formData: FormData) {
  const next = normalizeDashboardRedirect(formValue(formData, 'next'));
  const result = await verifyWebLogin({
    username: formValue(formData, 'username'),
    password: formValue(formData, 'password'),
  });

  if (!result.authenticated) {
    loginRedirect(result.reason, next);
  }

  const cookieStore = await cookies();
  cookieStore.set(
    WEB_AUTH_COOKIE_NAME,
    result.cookieValue,
    getWebSessionCookieOptions({
      maxAge: result.session.expiresAt - Math.floor(Date.now() / 1000),
    }),
  );

  redirect(next);
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.set(
    WEB_AUTH_COOKIE_NAME,
    '',
    getWebSessionCookieOptions({ maxAge: 0 }),
  );

  redirect('/?signedOut=1');
}
