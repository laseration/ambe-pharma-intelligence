import { env } from '../config/env';
import {
  getMicrosoftGraphAccessToken,
  isMicrosoftGraphConfigured,
} from '../email/graph';
import { logger } from '../lib/logger';
import { buildAccountOpeningAnswersSheetPdf } from './answersSheet';
import type { AccountOpeningDocxFillValues } from './docxFill';
import {
  contentTypeForFile,
  fillAccountOpeningForm,
  type AccountOpeningUnifiedFillResult,
} from './formFill';

/**
 * Emails an account-opening review draft to an internal reviewer (e.g. the
 * approving director). This is a REVIEW step, not a send-to-supplier step: the
 * attachment is an unsigned draft with bank/signature fields left blank, the
 * body is explicitly labelled "do not send as-is", and the recipients are an
 * internal allow-list — never the supplier.
 */

// Microsoft Graph caps a single inline (base64) attachment at ~3MB.
const MAX_INLINE_ATTACHMENT_BYTES = 3 * 1024 * 1024;

export type AccountOpeningReviewEmailAttachment = {
  fileName: string;
  contentType: string;
  content: Uint8Array;
};

export type AccountOpeningReviewEmailStatus =
  | 'SENT'
  | 'SKIPPED_DISABLED'
  | 'NO_RECIPIENTS'
  | 'ATTACHMENT_TOO_LARGE'
  | 'FAILED';

export type AccountOpeningReviewEmailResult = {
  status: AccountOpeningReviewEmailStatus;
  note: string;
  recipients: string[];
  attachmentNames: string[];
  attemptedAt: Date;
};

export type SendReviewEmailDeps = {
  getAccessToken?: typeof getMicrosoftGraphAccessToken;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** Resolve the review-email recipients (dedicated var, else the alert list). */
export function getAccountOpeningReviewRecipients(): string[] {
  const dedicated = env.accountOpeningReviewEmailRecipients ?? [];
  if (dedicated.length > 0) {
    return dedicated;
  }
  return env.internalAlertEmailRecipients ?? [];
}

export async function sendAccountOpeningReviewEmail(
  input: {
    recipients: string[];
    subject: string;
    bodyText: string;
    attachments: AccountOpeningReviewEmailAttachment[];
  },
  deps: SendReviewEmailDeps = {},
): Promise<AccountOpeningReviewEmailResult> {
  const now = deps.now ?? (() => new Date());
  const attemptedAt = now();
  const recipients = input.recipients.map((r) => r.trim()).filter(Boolean);
  const attachmentNames = input.attachments.map((a) => a.fileName);

  if (!env.emailAlertsEnabled || !isMicrosoftGraphConfigured()) {
    return {
      status: 'SKIPPED_DISABLED',
      note: 'Outbound email is not configured (EMAIL_ALERTS_ENABLED / Microsoft Graph credentials).',
      recipients,
      attachmentNames,
      attemptedAt,
    };
  }
  if (recipients.length === 0) {
    return {
      status: 'NO_RECIPIENTS',
      note: 'No reviewer recipients configured.',
      recipients,
      attachmentNames,
      attemptedAt,
    };
  }
  const oversized = input.attachments.find(
    (a) => a.content.length > MAX_INLINE_ATTACHMENT_BYTES,
  );
  if (oversized) {
    return {
      status: 'ATTACHMENT_TOO_LARGE',
      note: `Attachment "${oversized.fileName}" exceeds the ${MAX_INLINE_ATTACHMENT_BYTES}-byte inline limit.`,
      recipients,
      attachmentNames,
      attemptedAt,
    };
  }

  const getAccessToken = deps.getAccessToken ?? getMicrosoftGraphAccessToken;
  const fetchImpl = deps.fetchImpl ?? fetch;

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
          subject: input.subject,
          body: { contentType: 'Text', content: input.bodyText },
          toRecipients: recipients.map((address) => ({
            emailAddress: { address },
          })),
          attachments: input.attachments.map((a) => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: a.fileName,
            contentType: a.contentType,
            contentBytes: toBase64(a.content),
          })),
        },
        saveToSentItems: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        status: 'FAILED',
        note: `Microsoft Graph sendMail failed with status ${response.status}. ${errorText.slice(0, 300)}`,
        recipients,
        attachmentNames,
        attemptedAt,
      };
    }

    logger.info('Account-opening review email sent', {
      senderMailbox: env.microsoftGraphSenderMailbox,
      recipientCount: recipients.length,
      attachmentCount: input.attachments.length,
    });

    return {
      status: 'SENT',
      note: `Review draft emailed to ${recipients.length} reviewer(s).`,
      recipients,
      attachmentNames,
      attemptedAt,
    };
  } catch (error) {
    return {
      status: 'FAILED',
      note: `Email send error: ${(error as Error).message}`,
      recipients,
      attachmentNames,
      attemptedAt,
    };
  }
}

export type EmailAccountOpeningReviewDraftResult = {
  fill: AccountOpeningUnifiedFillResult;
  email: AccountOpeningReviewEmailResult;
};

export function buildAccountOpeningReviewEmailBody(
  fileName: string,
  supplierName: string | null | undefined,
  fill: AccountOpeningUnifiedFillResult,
): string {
  const sectionLabel = (raw: string | null): string => {
    if (!raw) {
      return '';
    }
    if (/DIRECTOR/.test(raw)) return 'DIRECTOR ';
    if (/RESPONSIBLE/.test(raw)) return 'RESPONSIBLE PERSON ';
    if (/CUSTOMER/.test(raw)) return 'CUSTOMER SERVICE ';
    if (/SALES/.test(raw)) return 'SALES ';
    if (/ACCOUNTS|FINANCE/.test(raw)) return 'ACCOUNTS ';
    if (/OUT OF HOURS/.test(raw)) return 'OUT OF HOURS ';
    return '';
  };
  const filledLines = fill.filledFields.map(
    (f) => `  - ${sectionLabel(f.section)}${f.label}: ${f.value}`,
  );
  const blankForYou = fill.blankFields
    .filter((b) => b.reason !== 'UNRECOGNISED_FIELD')
    .map(
      (b) =>
        `  - ${sectionLabel(b.section)}${b.label}${
          b.reason === 'POLICY_MUST_STAY_BLANK'
            ? ' (left blank on purpose — sensitive/complete by hand)'
            : ' (no value on file)'
        }`,
    );

  const didFill = fill.filledCount > 0;
  const header = didFill
    ? 'ACCOUNT OPENING — REVIEW DRAFT (NOT SIGNED, NOT SENT)'
    : 'ACCOUNT OPENING — COULD NOT AUTO-FILL (manual completion needed)';
  const intro = didFill
    ? [
        'The bot has filled the safe fields of the attached form from the Ambe',
        'master profile. This is a DRAFT for your review only. Bank details and',
        'signatures are deliberately left blank and must be completed by hand.',
        'Do not send this to the supplier as-is.',
      ]
    : [
        'The bot could NOT auto-fill this form (no matching fields were found, or',
        'the master profile is incomplete). The ORIGINAL form is attached unchanged.',
        'Use the attached "Ambe answers" sheet to complete it by hand. Bank details',
        'and signatures must always be completed by hand. Do not send as-is.',
      ];

  return [
    header,
    '',
    `Supplier form: ${fileName}`,
    supplierName ? `Counterparty: ${supplierName}` : null,
    '',
    ...intro,
    '',
    ...(didFill
      ? [`Auto-filled (${fill.filledCount}):`, ...filledLines, '']
      : []),
    'Left blank for you to complete/verify:',
    ...blankForYou,
    '',
    'Please review every field before anything is signed or sent.',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export async function emailAccountOpeningReviewDraft(
  input: {
    formBytes: Uint8Array | Buffer;
    fileName: string;
    values: AccountOpeningDocxFillValues;
    recipients: string[];
    supplierName?: string | null;
  },
  deps: SendReviewEmailDeps = {},
): Promise<EmailAccountOpeningReviewDraftResult> {
  const fill = await fillAccountOpeningForm({
    bytes: input.formBytes,
    fileName: input.fileName,
    values: input.values,
  });

  if (fill.filledCount === 0) {
    logger.info(
      'Account-opening form produced zero auto-filled fields; sending manual-completion notice',
      { fileName: input.fileName, format: fill.format },
    );
  }

  const baseName = input.fileName.replace(/\.(docx?|pdf)$/i, '');
  const attachment: AccountOpeningReviewEmailAttachment =
    fill.filledBytes && fill.filledContentType
      ? {
          fileName: `${baseName} - DRAFT (review, unsigned)${fill.filledFileSuffix}`,
          contentType: fill.filledContentType,
          content: fill.filledBytes,
        }
      : {
          fileName: input.fileName,
          contentType: contentTypeForFile(input.fileName),
          content: Buffer.from(input.formBytes),
        };

  const supplierLabel = input.supplierName?.trim() || null;
  const subject =
    fill.filledCount > 0
      ? `Account opening draft for review${supplierLabel ? ` — ${supplierLabel}` : ''}`
      : `Account opening form needs manual completion${supplierLabel ? ` — ${supplierLabel}` : ''}`;

  // The answers sheet is ALWAYS attached — it is the reliable fallback for forms
  // the bot cannot fill in place (flat/scanned PDFs, legacy .doc).
  const now = deps.now ?? (() => new Date());
  const answersSheet = await buildAccountOpeningAnswersSheetPdf({
    values: input.values,
    supplierName: supplierLabel,
    formName: input.fileName,
    generatedAtIso: now().toISOString().slice(0, 10),
  });
  const attachments: AccountOpeningReviewEmailAttachment[] = [
    attachment,
    {
      fileName: `Ambe answers - ${baseName}.pdf`,
      contentType: 'application/pdf',
      content: answersSheet,
    },
  ];

  const email = await sendAccountOpeningReviewEmail(
    {
      recipients: input.recipients,
      subject,
      bodyText: buildAccountOpeningReviewEmailBody(
        input.fileName,
        supplierLabel,
        fill,
      ),
      attachments,
    },
    deps,
  );

  return { fill, email };
}
