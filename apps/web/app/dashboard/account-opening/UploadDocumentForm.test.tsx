import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, isValidElement, type ReactNode } from 'react';

// The component lives under the [id] route dir; tsx --test cannot glob-match a
// test file inside a "[id]" directory, so this test sits one level up and
// imports the component via a literal path.
import { UploadDocumentForm } from './[id]/UploadDocumentForm';

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

test('upload document form renders the file control and review-only safety copy', () => {
  const text = collectText(UploadDocumentForm({ action: noop }));

  assert.match(text, /Upload a document/);
  assert.match(text, /Document file/);
  assert.match(text, /Upload & classify/);
  assert.match(text, /never signs, sends, or completes/);
  assert.match(text, /raw files are not shown/);
});

test('upload document form surfaces a classification result and an error state', () => {
  const ok = collectText(
    UploadDocumentForm({
      action: noop,
      classification: 'ACCOUNT_OPENING_FORM',
      fileName: 'account-opening-form.pdf',
      supplierName: 'Acme Pharma Ltd',
    }),
  );
  assert.match(ok, /classified as\s+ACCOUNT_OPENING_FORM/);
  assert.match(ok, /account-opening-form\.pdf/);
  assert.match(ok, /Detected supplier:\s+Acme Pharma Ltd/);

  const failed = collectText(
    UploadDocumentForm({
      action: noop,
      error: 'The file exceeds the 10MB limit.',
      pending: true,
    }),
  );
  assert.match(failed, /exceeds the 10MB limit/);
  assert.match(failed, /Uploading/);
});
