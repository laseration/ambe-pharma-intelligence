'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { prepareWebLogin, prepareWebLogout } from '../../lib/webAuthFlow';

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === 'string' ? value : '';
}

export async function loginAction(formData: FormData) {
  const result = await prepareWebLogin({
    username: formValue(formData, 'username'),
    password: formValue(formData, 'password'),
    next: formValue(formData, 'next'),
  });

  if (result.cookie) {
    const cookieStore = await cookies();
    cookieStore.set(
      result.cookie.name,
      result.cookie.value,
      result.cookie.options,
    );
  }

  redirect(result.redirectTo);
}

export async function logoutAction() {
  const result = prepareWebLogout();
  const cookieStore = await cookies();
  cookieStore.set(
    result.cookie.name,
    result.cookie.value,
    result.cookie.options,
  );

  redirect(result.redirectTo);
}
