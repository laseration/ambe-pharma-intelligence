import React from 'react';

import type { AccountOpeningCaseTimelineEntry } from '../../../../lib/accountOpeningApi';

function formatOccurredAt(iso: string): string {
  // Stable, locale-independent rendering (no Date parsing / timezone drift).
  return iso.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
}

export function CaseActivityTimeline({
  entries,
}: {
  entries: AccountOpeningCaseTimelineEntry[];
}) {
  return (
    <section className="panel dashboard-panel">
      <div className="dashboard-section-header">
        <div>
          <h3 className="section-title">Activity</h3>
          <p className="copy">
            Read-only audit trail of what the bot and operators have done on
            this case. It does not sign, send, or submit anything.
          </p>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="copy">No activity recorded yet.</p>
      ) : (
        <ul className="timeline-list">
          {entries.map((entry) => (
            <li key={entry.id} className="timeline-item">
              <span className="timeline-label">{entry.label}</span>
              {entry.detail ? (
                <span className="timeline-detail"> — {entry.detail}</span>
              ) : null}
              {entry.note ? (
                <p className="timeline-note copy">{entry.note}</p>
              ) : null}
              <span className="timeline-meta copy">
                {formatOccurredAt(entry.occurredAt)}
                {entry.actorType ? ` · ${entry.actorType}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
