import { env } from '../config/env';
import {
  getMicrosoftGraphAccessToken,
  isMicrosoftGraphConfigured,
} from '../email/graph';
import { logger } from '../lib/logger';
import type { PollingWorkerSnapshot } from './status';

/**
 * Internal operational alert for a stalled poller. A silent poller stall means
 * inbound price lists / account forms stop being processed, so when a worker
 * records a run of consecutive failures we email the internal alert recipients.
 *
 * Safety: gated behind EMAIL_ALERTS_ENABLED + configured Microsoft Graph (so it
 * stays silent in dev / on a dormant box), sends only SAFE status fields (no
 * message bodies), and is intended to be called non-blocking.
 */

// Alert once a worker reaches this many consecutive failed runs. The poller
// triggers on the exact crossing, so this fires once per failure streak and
// resets when a run succeeds (consecutiveFailures returns to 0).
export const POLLING_FAILURE_ALERT_THRESHOLD = 3;

export type PollingFailureAlertStatus =
  | 'SENT'
  | 'SKIPPED_DISABLED'
  | 'NO_RECIPIENTS'
  | 'FAILED';

export type PollingFailureAlertResult = {
  status: PollingFailureAlertStatus;
  note: string;
};

export type SendPollingFailureAlertDeps = {
  getAccessToken?: typeof getMicrosoftGraphAccessToken;
  fetchImpl?: typeof fetch;
};

export async function sendPollingFailureAlert(
  snapshot: PollingWorkerSnapshot,
  deps: SendPollingFailureAlertDeps = {},
): Promise<PollingFailureAlertResult> {
  if (!env.emailAlertsEnabled || !isMicrosoftGraphConfigured()) {
    return {
      status: 'SKIPPED_DISABLED',
      note: 'Outbound alert email is not configured (EMAIL_ALERTS_ENABLED / Microsoft Graph).',
    };
  }

  const recipients = (env.internalAlertEmailRecipients ?? [])
    .map((recipient) => recipient.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    return {
      status: 'NO_RECIPIENTS',
      note: 'No INTERNAL_ALERT_EMAIL_RECIPIENTS configured.',
    };
  }

  const getAccessToken = deps.getAccessToken ?? getMicrosoftGraphAccessToken;
  const fetchImpl = deps.fetchImpl ?? fetch;

  const subject = `[Ambe] ${snapshot.name} poller failing — ${snapshot.consecutiveFailures} consecutive failures`;
  const bodyText = [
    `The ${snapshot.name} poller has recorded ${snapshot.consecutiveFailures} consecutive failed runs.`,
    snapshot.lastFailureAt ? `Last failure: ${snapshot.lastFailureAt}` : '',
    // lastError is already sanitised by the status store (no secrets/bodies).
    snapshot.lastError ? `Last error: ${snapshot.lastError}` : '',
    '',
    'Inbound processing may be stalled. Check worker status at /api/system/workers.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const accessToken = await getAccessToken();
    const sendMailUrl = env.microsoftGraphRefreshToken
      ? 'https://graph.microsoft.com/v1.0/me/sendMail'
      : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
          env.microsoftGraphSenderMailbox,
        )}/sendMail`;

    const response = await fetchImpl(sendMailUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'Text', content: bodyText },
          toRecipients: recipients.map((address) => ({
            emailAddress: { address },
          })),
        },
        saveToSentItems: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        status: 'FAILED',
        note: `Microsoft Graph sendMail failed with status ${response.status}. ${errorText.slice(0, 200)}`,
      };
    }

    logger.warn('Polling failure alert sent', {
      worker: snapshot.name,
      consecutiveFailures: snapshot.consecutiveFailures,
      recipientCount: recipients.length,
    });
    return {
      status: 'SENT',
      note: `Alert emailed to ${recipients.length} recipient(s).`,
    };
  } catch (error) {
    return {
      status: 'FAILED',
      note: `Alert send error: ${(error as Error).message}`,
    };
  }
}
