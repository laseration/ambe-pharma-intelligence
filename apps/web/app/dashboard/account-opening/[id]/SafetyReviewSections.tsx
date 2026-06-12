import React from 'react';

import type {
  AccountOpeningCaseDetail,
  AccountOpeningPolicyRiskFlag,
} from '../../../../lib/accountOpeningApi';

function uniqueValues(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function riskFlagKey(flag: AccountOpeningPolicyRiskFlag): string {
  return [
    flag.fieldKey,
    flag.supplierLabel,
    flag.fieldClass,
    flag.policyDecision,
    flag.riskCategory,
  ].join('|');
}

export function accountOpeningPolicyRiskFlags(
  item: AccountOpeningCaseDetail,
): AccountOpeningPolicyRiskFlag[] {
  const seen = new Set<string>();
  const flags: AccountOpeningPolicyRiskFlag[] = [];

  for (const flag of [
    ...item.policyRiskFlags,
    ...item.completionDraft.riskFlags,
  ]) {
    const key = riskFlagKey(flag);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    flags.push(flag);
  }

  return flags;
}

export function accountOpeningPolicySigningNotes(
  item: AccountOpeningCaseDetail,
): string[] {
  return uniqueValues([
    ...item.policySigningNotes,
    ...item.completionDraft.signingNotes,
  ]);
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function AccountOpeningSafetyReviewSections({
  item,
}: {
  item: AccountOpeningCaseDetail;
}) {
  const riskFlags = accountOpeningPolicyRiskFlags(item);
  const signingNotes = accountOpeningPolicySigningNotes(item);

  return (
    <>
      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <h3 className="section-title">Policy risk flags</h3>
            <p className="copy review-summary-copy">
              Blocked and review-required account-opening fields. These fields
              stay blank in draft and fill-preview output.
            </p>
          </div>
          <span className="pill pill-high">
            {riskFlags.length} risk{riskFlags.length === 1 ? '' : 's'}
          </span>
        </div>

        {riskFlags.length ? (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Policy</th>
                  <th>Risk</th>
                  <th>Reason</th>
                  <th>Routing / signing note</th>
                </tr>
              </thead>
              <tbody>
                {riskFlags.map((flag) => (
                  <tr key={riskFlagKey(flag)}>
                    <td>
                      <strong>{flag.supplierLabel}</strong>
                      <span className="muted-text"> {flag.fieldKey}</span>
                    </td>
                    <td>
                      {humanize(flag.fieldClass)} /{' '}
                      {humanize(flag.policyDecision)}
                    </td>
                    <td>{humanize(flag.riskCategory)}</td>
                    <td>{flag.reason}</td>
                    <td>
                      {uniqueValues([
                        flag.signatoryRoutingNote ?? '',
                        flag.signingNote ?? '',
                      ]).join(' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="alert alert-success">
            No policy risk flags are currently recorded.
          </p>
        )}
      </section>

      <section className="panel dashboard-panel">
        <h3 className="section-title">Policy signing route notes</h3>
        {signingNotes.length ? (
          <ul className="simple-list compact-list">
            {signingNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : (
          <p className="copy">
            No additional policy signing route notes are currently recorded.
          </p>
        )}
      </section>
    </>
  );
}
