import { NextResponse, type NextRequest } from 'next/server';

import { readWebSession, WEB_AUTH_COOKIE_NAME } from './lib/internalWebAuth';

export async function middleware(request: NextRequest) {
  const session = await readWebSession(
    request.cookies.get(WEB_AUTH_COOKIE_NAME)?.value,
  );

  if (session) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/', request.url);
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set('next', nextPath);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
