import { createHash } from 'node:crypto';

import type { EmailInboundItemResult } from './types';

export type StoredEmailReviewItem = EmailInboundItemResult & {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

export const MAX_EMAIL_REVIEW_ITEMS = 200;

const REVIEW_STATUSES = new Set(['NEEDS_REVIEW', 'REVIEW_REQUIRED', 'FAILED']);
// Temporary internal review storage for email items. This is intentionally in-memory
// until a durable inbound email record path is justified.
const emailReviewStore = new Map<string, StoredEmailReviewItem>();

function buildStoreKey(item: EmailInboundItemResult): string {
  return [
    item.email.messageId ?? '',
    item.email.from,
    item.attachment.fileName ?? '',
    item.attachment.contentId ?? '',
    item.processingStatus,
  ].join('|');
}

function buildStableItemId(storeKey: string): string {
  return `email-review-${createHash('sha1').update(storeKey).digest('hex').slice(0, 16)}`;
}

function pruneEmailReviewStore(maxItems = MAX_EMAIL_REVIEW_ITEMS): void {
  const sortedEntries = [...emailReviewStore.entries()].sort((left, right) => {
    const leftTime = left[1].updatedAt.getTime();
    const rightTime = right[1].updatedAt.getTime();
    return rightTime - leftTime;
  });

  sortedEntries.slice(maxItems).forEach(([key]) => {
    emailReviewStore.delete(key);
  });
}

export function recordEmailReviewItems(
  items: EmailInboundItemResult[],
  recordedAt = new Date(),
  maxItems = MAX_EMAIL_REVIEW_ITEMS,
): void {
  items.forEach((item) => {
    if (!REVIEW_STATUSES.has(item.processingStatus)) {
      return;
    }

    const storeKey = buildStoreKey(item);
    const existing = emailReviewStore.get(storeKey);

    emailReviewStore.set(storeKey, {
      ...item,
      id: existing?.id ?? buildStableItemId(storeKey),
      createdAt: existing?.createdAt ?? recordedAt,
      updatedAt: recordedAt,
    });
  });

  pruneEmailReviewStore(maxItems);
}

export function listStoredEmailReviewItems(): StoredEmailReviewItem[] {
  return [...emailReviewStore.values()].sort((left, right) => {
    const rightTime = right.updatedAt.getTime();
    const leftTime = left.updatedAt.getTime();

    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return right.createdAt.getTime() - left.createdAt.getTime();
  });
}

export function resetEmailReviewStore(): void {
  emailReviewStore.clear();
}
