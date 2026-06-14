'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { navIcons, type NavIconKey } from './NavIcons';

const LAST_INBOX_SEEN_AT_KEY = 'ambe:lastInboxSeenAt';

export type SidebarNavItem = {
  href: string;
  label: string;
  iconKey: NavIconKey;
  /** Static count badge (e.g. open review items). Hidden when 0. */
  badge?: number;
  /** Inbox item: compute an unread badge from recentEmailTimestamps. */
  inboxUnread?: boolean;
};

export type SidebarNavGroup = {
  label: string;
  items: SidebarNavItem[];
};

type SidebarNavProps = {
  groups: SidebarNavGroup[];
  recentEmailTimestamps: string[];
};

function parseTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ groups, recentEmailTimestamps }: SidebarNavProps) {
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

  const inboxUnreadCount = useMemo(() => {
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
    <nav className="sidebar-nav" aria-label="Dashboard">
      {groups.map((group) => (
        <div className="nav-group" key={group.label}>
          <p className="nav-group-label">{group.label}</p>
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            const badgeNumber = item.inboxUnread
              ? inboxUnreadCount
              : (item.badge ?? 0);
            const badgeLabel = badgeNumber > 9 ? '9+' : String(badgeNumber);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? 'nav-item is-active' : 'nav-item'}
                aria-current={active ? 'page' : undefined}
              >
                <span className="nav-item-icon">{navIcons[item.iconKey]}</span>
                <span className="nav-item-label">{item.label}</span>
                {badgeNumber > 0 ? (
                  <span
                    className="nav-badge"
                    aria-label={
                      item.inboxUnread
                        ? `${badgeLabel} unread inbox emails`
                        : `${badgeLabel} items`
                    }
                  >
                    {badgeLabel}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
