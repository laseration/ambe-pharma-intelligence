import { cookies } from 'next/headers';

import {
  readWebSession,
  WEB_AUTH_COOKIE_NAME,
  type WebAuthSession,
} from './internalWebAuth';

export async function getCurrentWebSession(): Promise<WebAuthSession | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(WEB_AUTH_COOKIE_NAME)?.value;

  return readWebSession(cookieValue);
}
