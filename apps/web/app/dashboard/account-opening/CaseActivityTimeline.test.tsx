import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, isValidElement, type ReactNode } from 'react';

// Component lives under the [id] route dir; tsx --test cannot glob-match a test
// inside a "[id]" directory, so this test sits one level up.
import { CaseActivityTimeline } from './[id]/CaseActivityTimeline';

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

test('case activity timeline renders entries with label, detail, actor and time', () => {
  const text = collectText(
    CaseActivityTimeline({
      entries: [
        {
          id: 'e1',
          actionType: 'ACCOUNT_OPENING_AUTO_REPLIED',
          label: 'Auto-reply sent to internal reviewer',
          actorType: 'SYSTEM',
          actorIdentifier: 'account-opening-auto-reply',
          note: 'Review draft emailed.',
          detail: 'SENT → sandeep@ambemedical.com',
          occurredAt: '2026-06-19T10:00:00.000Z',
        },
      ],
    }),
  );

  assert.match(text, /Activity/);
  assert.match(text, /Auto-reply sent to internal reviewer/);
  assert.match(text, /SENT → sandeep@ambemedical\.com/);
  assert.match(text, /Review draft emailed/);
  assert.match(text, /2026-06-19 10:00:00Z/);
  assert.match(text, /SYSTEM/);
});

test('case activity timeline shows an empty state', () => {
  const text = collectText(CaseActivityTimeline({ entries: [] }));
  assert.match(text, /No activity recorded yet/);
});
