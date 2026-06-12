import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { loginAction } from '../auth/actions';
import { getCurrentWebSession } from '../../lib/serverWebAuth';

export const metadata: Metadata = {
  title: 'Internal Sign-In | Ambe Intelligence',
  robots: {
    index: false,
    follow: false,
  },
};

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    next?: string;
    signedOut?: string;
  }>;
};

function normalizeDashboardRedirect(value: string | undefined): string {
  if (value?.startsWith('/dashboard')) {
    return value;
  }

  return '/dashboard';
}

function errorMessage(value: string | undefined): string | null {
  if (value === 'not-configured') {
    return 'Internal web authentication is not configured. Set the WEB_AUTH_* environment variables before signing in.';
  }

  if (value === 'invalid') {
    return 'Invalid username or password.';
  }

  return null;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = searchParams ? await searchParams : undefined;
  const next = normalizeDashboardRedirect(query?.next);
  const session = await getCurrentWebSession();
  const message = errorMessage(query?.error);

  if (session) {
    redirect(next);
  }

  return (
    <main className="login-page">
      <section className="panel auth-panel">
        <p className="eyebrow">Internal Sign-In</p>
        <h1 className="title">Access Ambe Intelligence</h1>
        <p className="copy">
          Sign in with the internal pilot credentials issued for this dashboard.
        </p>

        {query?.signedOut ? (
          <p className="alert alert-success">You have been signed out.</p>
        ) : null}

        {message ? <p className="alert alert-error">{message}</p> : null}

        <form action={loginAction} className="action-form auth-form">
          <input name="next" type="hidden" value={next} />
          <label>
            Username
            <input
              autoComplete="username"
              name="username"
              required
              type="text"
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              name="password"
              required
              type="password"
            />
          </label>
          <button className="button button-primary button-large" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
