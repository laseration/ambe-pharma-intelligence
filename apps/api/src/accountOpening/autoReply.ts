import { env } from '../config/env';
import type { NormalizedEmailAttachment } from '../email/inbound/types';
import type { AccountOpeningDocxFillValues } from './docxFill';
import { getAccountOpeningMasterProfile } from './masterProfile';
import {
  emailAccountOpeningReviewDraft,
  type EmailAccountOpeningReviewDraftResult,
} from './reviewEmail';

/**
 * Auto-fill-and-reply for inbound account-opening forms.
 *
 * Safety model:
 * - Gated OFF by default (`ACCOUNT_OPENING_AUTO_REPLY_ENABLED`).
 * - ONLY replies when the sender is an INTERNAL Ambe address (domain match).
 *   An external/supplier sender is never auto-replied a filled form — those
 *   only ever create a review case upstream.
 * - The reply is an unsigned draft + answers sheet, labelled "do not send as-is".
 */

export type AccountOpeningAutoReplyStatus =
  | 'SENT'
  | 'SKIPPED_DISABLED'
  | 'SKIPPED_EXTERNAL_SENDER'
  | 'SKIPPED_NO_FORM'
  | 'FAILED';

export type AccountOpeningAutoReplyResult = {
  status: AccountOpeningAutoReplyStatus;
  note: string;
  recipient: string;
};

export type AutoReplyDeps = {
  emailReviewDraft?: typeof emailAccountOpeningReviewDraft;
  values?: AccountOpeningDocxFillValues;
  now?: () => Date;
};

/** A sender is internal if its domain matches a configured internal domain. */
export function isInternalAmbeSender(senderEmail: string): boolean {
  const email = senderEmail.trim().toLowerCase();
  if (!email.includes('@')) {
    return false;
  }
  const domain = email.split('@').pop() ?? '';
  if (!domain) {
    return false;
  }
  return env.emailInboundInternalDomains.some((entry) => {
    const normalized = entry.trim().toLowerCase().replace(/^@+/, '');
    return (
      Boolean(normalized) &&
      (domain === normalized || domain.endsWith(`.${normalized}`))
    );
  });
}

function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /to be confirmed/i.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

/**
 * Map the vetted master profile (env-driven) into the fill values. The master
 * profile is the single source of truth; contact sections it does not carry are
 * left blank (and still appear on the answers sheet for manual completion).
 */
export function masterProfileToDocxValues(): AccountOpeningDocxFillValues {
  const p = getAccountOpeningMasterProfile().values;
  return {
    legalCompanyName: clean(p.legalCompanyName),
    tradingName: clean(p.tradingName),
    registeredAddress: clean(p.registeredAddress),
    warehouseAddress: clean(p.tradingAddress),
    companyNumber: clean(p.companyNumber),
    vatNumber: clean(p.vatNumber),
    website: clean(p.website),
    telephone: clean(p.mainContactPhone),
    wdaNumber: clean(p.wholesaleDealerAuthorisation),
    director: clean(p.mainContactName)
      ? {
          name: clean(p.mainContactName),
          email: clean(p.mainContactEmail),
          phone: clean(p.mainContactPhone),
        }
      : undefined,
    responsiblePerson: clean(p.responsiblePerson)
      ? { name: clean(p.responsiblePerson) }
      : undefined,
    accounts: clean(p.accountsContact)
      ? { name: clean(p.accountsContact) }
      : undefined,
  };
}

const FORM_EXTENSION = /\.(docx?|pdf)$/i;

function pickFormAttachment(
  attachments: NormalizedEmailAttachment[],
): NormalizedEmailAttachment | null {
  const isForm = (a: NormalizedEmailAttachment) =>
    Boolean(a.buffer) && FORM_EXTENSION.test(a.fileName ?? '');
  // Prefer a Word doc (the only format we fill in place today), else any form.
  return (
    attachments.find((a) => isForm(a) && /\.docx?$/i.test(a.fileName ?? '')) ??
    attachments.find(isForm) ??
    null
  );
}

export async function autoReplyAccountOpeningForm(
  input: {
    senderEmail: string;
    attachments: NormalizedEmailAttachment[];
    supplierName?: string | null;
  },
  deps: AutoReplyDeps = {},
): Promise<AccountOpeningAutoReplyResult> {
  const recipient = input.senderEmail;

  if (!env.accountOpeningAutoReplyEnabled) {
    return {
      status: 'SKIPPED_DISABLED',
      note: 'Account-opening auto-reply is disabled (ACCOUNT_OPENING_AUTO_REPLY_ENABLED).',
      recipient,
    };
  }
  if (!isInternalAmbeSender(recipient)) {
    return {
      status: 'SKIPPED_EXTERNAL_SENDER',
      note: 'Sender is not an internal Ambe address — a filled form is never auto-replied to an external/supplier sender.',
      recipient,
    };
  }

  const form = pickFormAttachment(input.attachments);
  if (!form?.buffer) {
    return {
      status: 'SKIPPED_NO_FORM',
      note: 'No PDF/Word form attachment with content was found.',
      recipient,
    };
  }

  const emailReviewDraft =
    deps.emailReviewDraft ?? emailAccountOpeningReviewDraft;
  const values = deps.values ?? masterProfileToDocxValues();

  try {
    const result: EmailAccountOpeningReviewDraftResult = await emailReviewDraft(
      {
        formBytes: form.buffer,
        fileName: form.fileName ?? 'account-opening-form',
        values,
        recipients: [recipient],
        supplierName: input.supplierName ?? null,
      },
      { now: deps.now },
    );
    return {
      status: result.email.status === 'SENT' ? 'SENT' : 'FAILED',
      note: result.email.note,
      recipient,
    };
  } catch (error) {
    return {
      status: 'FAILED',
      note: `Auto-reply failed: ${(error as Error).message}`,
      recipient,
    };
  }
}
