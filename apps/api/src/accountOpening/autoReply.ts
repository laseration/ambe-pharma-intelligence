import { env } from '../config/env';
import type { NormalizedEmailAttachment } from '../email/inbound/types';
import { db } from '../lib/db';
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
  | 'SKIPPED_NO_CASE_ID'
  | 'SKIPPED_ALREADY_REPLIED'
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
  alreadyReplied?: (caseId: string) => Promise<boolean>;
  recordReplyEvent?: (input: {
    caseId: string;
    status: AccountOpeningAutoReplyStatus;
    recipient: string;
    fileName: string;
    note: string;
  }) => Promise<void>;
};

// Audit + idempotency in one: a single durable case event marks "we replied".
// Its presence proves the reply happened (audit trail) AND stops a re-polled
// message from emailing the reviewer the same draft twice.
const AUTO_REPLY_EVENT = 'ACCOUNT_OPENING_AUTO_REPLIED';

async function defaultAlreadyReplied(caseId: string): Promise<boolean> {
  const client = db as never as {
    accountOpeningCaseEvent?: {
      findFirst: (args: unknown) => Promise<{ id: string } | null>;
    };
  };
  if (!client.accountOpeningCaseEvent) {
    return false;
  }
  const found = await client.accountOpeningCaseEvent.findFirst({
    where: { accountOpeningCaseId: caseId, actionType: AUTO_REPLY_EVENT },
    select: { id: true },
  });
  return Boolean(found);
}

async function defaultRecordReplyEvent(input: {
  caseId: string;
  status: AccountOpeningAutoReplyStatus;
  recipient: string;
  fileName: string;
  note: string;
}): Promise<void> {
  const client = db as never as {
    accountOpeningCaseEvent?: {
      create: (args: { data: unknown }) => Promise<unknown>;
    };
  };
  if (!client.accountOpeningCaseEvent) {
    return;
  }
  await client.accountOpeningCaseEvent.create({
    data: {
      accountOpeningCaseId: input.caseId,
      actionType: AUTO_REPLY_EVENT,
      actorType: 'SYSTEM',
      actorIdentifier: 'account-opening-auto-reply',
      note: input.note,
      metadata: {
        status: input.status,
        recipient: input.recipient,
        fileName: input.fileName,
      },
    },
  });
}

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
function contactFrom(
  name: string,
  email: string,
  phone: string,
): AccountOpeningDocxFillValues['director'] {
  const c = { name: clean(name), email: clean(email), phone: clean(phone) };
  return c.name || c.email || c.phone ? c : undefined;
}

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
    fax: clean(p.faxNumber),
    telephone: clean(p.mainContactPhone),
    dateStartedTrading: clean(p.dateStartedTrading),
    regulatoryAuthority: clean(p.regulatoryAuthority),
    countryRegion: clean(p.countryRegion),
    wdaNumber: clean(p.wholesaleDealerAuthorisation),
    wdaGrantedDate: clean(p.wdaGrantedDate),
    lastGdpInspectionDate: clean(p.lastGdpInspectionDate),
    director: contactFrom(
      p.mainContactName,
      p.mainContactEmail,
      p.mainContactPhone,
    ),
    responsiblePerson: contactFrom(
      p.responsiblePerson,
      p.responsiblePersonEmail,
      p.responsiblePersonPhone,
    ),
    accounts: contactFrom(p.accountsContact, p.accountsEmail, p.accountsPhone),
    sales: contactFrom(p.salesName, p.salesEmail, p.salesPhone),
    customerService: contactFrom(
      p.customerServiceName,
      p.customerServiceEmail,
      p.customerServicePhone,
    ),
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
    caseId: string | null;
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

  // Without a case id there is no durable idempotency key: we could neither
  // check for a prior reply nor record this one, so every re-poll of the same
  // message would re-send. Refuse rather than send un-deduplicated.
  if (!input.caseId) {
    return {
      status: 'SKIPPED_NO_CASE_ID',
      note: 'No case id available; refusing to auto-reply without a durable idempotency key.',
      recipient,
    };
  }
  const caseId = input.caseId;

  const alreadyReplied = deps.alreadyReplied ?? defaultAlreadyReplied;
  const recordReplyEvent = deps.recordReplyEvent ?? defaultRecordReplyEvent;

  // Idempotency guard: if this same email is re-processed (worker restart,
  // transient failure, Graph re-delivery), never email the reviewer twice.
  if (await alreadyReplied(caseId)) {
    return {
      status: 'SKIPPED_ALREADY_REPLIED',
      note: 'A reply was already sent for this case; not sending again.',
      recipient,
    };
  }

  const emailReviewDraft =
    deps.emailReviewDraft ?? emailAccountOpeningReviewDraft;
  const values = deps.values ?? masterProfileToDocxValues();
  const fileName = form.fileName ?? 'account-opening-form';

  let result: EmailAccountOpeningReviewDraftResult;
  try {
    result = await emailReviewDraft(
      {
        formBytes: form.buffer,
        fileName,
        values,
        recipients: [recipient],
        supplierName: input.supplierName ?? null,
      },
      { now: deps.now },
    );
  } catch (error) {
    // The send itself failed — nothing went out, so reporting FAILED (which lets
    // the next poll retry) is correct.
    return {
      status: 'FAILED',
      note: `Auto-reply failed: ${(error as Error).message}`,
      recipient,
    };
  }

  const status: AccountOpeningAutoReplyStatus =
    result.email.status === 'SENT' ? 'SENT' : 'FAILED';

  // Record the audit/idempotency event ONLY on a confirmed send, so a failed
  // attempt is still retried on the next poll rather than silently swallowed.
  if (status === 'SENT') {
    try {
      await recordReplyEvent({
        caseId,
        status,
        recipient,
        fileName,
        note: result.email.note,
      });
    } catch (recordError) {
      // The email already went out. Returning FAILED here would make the next
      // poll re-send (the dedup event was never written) — a DUPLICATE reply.
      // Surface SENT with the bookkeeping failure noted instead.
      return {
        status,
        note: `${result.email.note} (warning: idempotency/audit record failed: ${(recordError as Error).message})`,
        recipient,
      };
    }
  }

  return { status, note: result.email.note, recipient };
}
