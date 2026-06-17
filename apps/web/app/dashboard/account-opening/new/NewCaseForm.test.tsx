import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, isValidElement, type ReactNode } from 'react';

import { NewCaseForm } from './NewCaseForm';

function collectText(node: ReactNode): string {
  const parts: string[] = [];

  function walk(value: ReactNode) {
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(String(value));
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (!isValidElement(value)) {
      return;
    }

    Children.forEach(
      (value as { props: { children?: ReactNode } }).props.children,
      walk,
    );
  }

  walk(node);
  return parts.join(' ');
}

const noop = () => {};

test('new account-opening case form renders required fields, case types, and safety copy', () => {
  const text = collectText(NewCaseForm({ action: noop, error: null }));

  assert.match(text, /Counterparty name/);
  assert.match(text, /Counterparty email/);
  assert.match(text, /Supplier onboarding/);
  assert.match(text, /Customer onboarding/);
  assert.match(text, /Unknown/);
  assert.match(text, /Create case/);
  // The internal-note field shows a visible warning against pasting bank data.
  assert.match(text, /Do not paste bank details/);
});

test('new account-opening case form surfaces a validation error and a pending state', () => {
  const text = collectText(
    NewCaseForm({
      action: noop,
      error: 'Counterparty name is required.',
      pending: true,
    }),
  );

  assert.match(text, /Counterparty name is required\./);
  assert.match(text, /Creating/);
});
