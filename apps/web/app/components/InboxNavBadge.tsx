'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const LAST_INBOX_SEEN_AT_KEY = 'ambe:lastInboxSeenAt';

type InboxNavBadgeProps = {
  href: string;
  label: string;
  recentEmailTimestamps: string[];
};

function parseTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function InboxNavBadge({
  href,
  label,
  recentEmailTimestamps,
}: InboxNavBadgeProps) {
  const pathname = usePathname();
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);
  const isInboxPage = pathname === '/dashboard/inbox';

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(LAST_INBOX_SEEN_AT_KEY);
      const parsedValue = rawValue ? Number(rawValue) : null;
      setLastSeenAt(
        parsedValue && Number.isFinite(parsedValue) ? parsedValue : null,
      );
    } catch {
      setLastSeenAt(null);
    }
  }, []);

  useEffect(() => {
    if (!isInboxPage) {
      return;
    }

    const now = Date.now();

    try {
      window.localStorage.setItem(LAST_INBOX_SEEN_AT_KEY, String(now));
    } catch {
      // Ignore storage failures and keep the UI usable.
    }

    setLastSeenAt(now);
  }, [isInboxPage]);

  const unreadCount = useMemo(() => {
    if (isInboxPage) {
      return 0;
    }

    return recentEmailTimestamps.filter((timestamp) => {
      const parsed = parseTimestamp(timestamp);

      if (parsed === null) {
        return false;
      }

      return lastSeenAt === null ? true : parsed > lastSeenAt;
    }).length;
  }, [isInboxPage, lastSeenAt, recentEmailTimestamps]);

  return (
    <Link href={href}>
      <span className="nav-link-content">
        <span>{label}</span>
        {unreadCount > 0 ? (
          <span
            className="nav-badge"
            aria-label={`${unreadCount > 9 ? '9+' : unreadCount} unread inbox emails`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
