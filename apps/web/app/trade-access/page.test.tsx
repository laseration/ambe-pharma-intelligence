import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';

import { TradeAccessPageContent } from './TradeAccessPageContent';
import {
  initialTradeAccessFormState,
  type TradeAccessFormState,
} from './state';

function walkReactTree(
  node: ReactNode,
  visit: (element: ReactElement<{ children?: ReactNode }>) => void,
) {
  if (Array.isArray(node)) {
    node.forEach((child) => walkReactTree(child, visit));
    return;
  }

  if (!isValidElement(node)) {
    return;
  }

  const element = node as ReactElement<{ children?: ReactNode }>;
  visit(element);

  Children.forEach(element.props.children, (child) => {
    walkReactTree(child, visit);
  });
}

function collectText(node: ReactNode): string {
  const parts: string[] = [];

  function walk(nodeToRead: ReactNode) {
    if (typeof nodeToRead === 'string' || typeof nodeToRead === 'number') {
      parts.push(String(nodeToRead));
      return;
    }

    if (Array.isArray(nodeToRead)) {
      nodeToRead.forEach(walk);
      return;
    }

    if (!isValidElement(nodeToRead)) {
      return;
    }

    const element = nodeToRead as ReactElement<{ children?: ReactNode }>;
    Children.forEach(element.props.children, walk);
  }

  walk(node);
  return parts.join(' ');
}

test('public Trade Access page renders one H1 with conservative RFQ copy', () => {
  const noopAction = async (
    state: TradeAccessFormState,
  ): Promise<TradeAccessFormState> => state;
  const element = TradeAccessPageContent({
    formAction: noopAction,
    initialFormState: initialTradeAccessFormState,
  });
  let h1Count = 0;

  walkReactTree(element, (node) => {
    if (node.type === 'h1') {
      h1Count += 1;
    }
  });

  const text = collectText(element);

  assert.equal(h1Count, 1);
  assert.match(text, /Submit a pharmaceutical trade requirement/i);
  assert.match(text, /not a public storefront or medicine catalogue/i);
  assert.match(text, /does not confirm availability, pricing/i);
  assert.match(text, /Do not submit patient information/i);
});
