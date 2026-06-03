import { env } from '../config/env';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { assertOpportunityReviewedForNotification } from '../safety/commercialApprovalGuard';
import {
  buildDailySummaryMessage,
  buildOpportunityMessage,
} from '../telegram/templates';
import {
  getMicrosoftGraphAccessToken,
  isMicrosoftGraphConfigured,
} from './graph';
import { parseStructuredPriceText } from './parsing';

type StructuredPriceTextDependencies = NonNullable<
  Parameters<typeof parseStructuredPriceText>[1]
>;

export type EmailBodyParsingDependencies = Pick<
  StructuredPriceTextDependencies,
  'aiOfferParser'
>;

async function findOpportunityForEmail(opportunityId: string) {
  return db.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      product: {
        select: {
          name: true,
        },
      },
      supplier: {
        select: {
          name: true,
        },
      },
    },
  });
}

function isEmailConfigured(): boolean {
  return Boolean(
    env.emailAlertsEnabled &&
    isMicrosoftGraphConfigured() &&
    env.internalAlertEmailRecipients.length > 0,
  );
}

function createEmailConfigError(): Error {
  return new Error(
    'Email alerts are not configured. Set EMAIL_ALERTS_ENABLED, MICROSOFT_MAIL_TENANT_ID, MICROSOFT_MAIL_CLIENT_ID, MICROSOFT_GRAPH_SENDER_MAILBOX, INTERNAL_ALERT_EMAIL_RECIPIENTS, and either MICROSOFT_MAIL_CLIENT_SECRET or MICROSOFT_GRAPH_REFRESH_TOKEN.',
  );
}

function buildOpportunityEmailSubject(
  opportunity: NonNullable<Awaited<ReturnType<typeof findOpportunityForEmail>>>,
) {
  return `Ambe Signal: ${opportunity.type} - ${opportunity.product?.name ?? 'Unknown product'}`;
}

function buildDailySummaryEmailSubject(generatedAt: Date): string {
  return `Ambe Signal Summary - ${generatedAt.toISOString().slice(0, 10)}`;
}

async function sendEmail(subject: string, text: string) {
  if (!isEmailConfigured()) {
    throw createEmailConfigError();
  }

  const accessToken = await getMicrosoftGraphAccessToken();
  const sendMailUrl = env.microsoftGraphRefreshToken
    ? 'https://graph.microsoft.com/v1.0/me/sendMail'
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.microsoftGraphSenderMailbox)}/sendMail`;
  const response = await fetch(sendMailUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: 'Text',
          content: text,
        },
        toRecipients: env.internalAlertEmailRecipients.map((emailAddress) => ({
          emailAddress: {
            address: emailAddress,
          },
        })),
      },
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Microsoft Graph sendMail failed with status ${response.status}. ${errorText}`,
    );
  }

  const messageId = `${env.microsoftGraphSenderMailbox}:${new Date().toISOString()}`;

  logger.info('Internal alert email sent', {
    messageId,
    senderMailbox: env.microsoftGraphSenderMailbox,
    authMode: env.microsoftGraphRefreshToken
      ? 'delegated_refresh_token'
      : 'application',
    recipientCount: env.internalAlertEmailRecipients.length,
    subject,
  });

  return {
    messageId,
    recipients: env.internalAlertEmailRecipients,
    subject,
    text,
  };
}

export async function previewEmailBodyParsing(
  bodyText: string,
  dependencies: EmailBodyParsingDependencies = {},
) {
  return parseStructuredPriceText(bodyText, {
    aiOfferParser: dependencies.aiOfferParser,
    source: 'EMAIL_BODY',
  });
}

export async function previewOpportunityEmail(opportunityId: string) {
  const opportunity = await findOpportunityForEmail(opportunityId);

  if (!opportunity) {
    throw new Error('Opportunity not found.');
  }
  assertOpportunityReviewedForNotification(opportunity);

  return {
    configured: isEmailConfigured(),
    recipients: env.internalAlertEmailRecipients,
    subject: buildOpportunityEmailSubject(opportunity),
    text: buildOpportunityMessage(opportunity),
  };
}

export async function sendOpportunityEmail(opportunityId: string) {
  const preview = await previewOpportunityEmail(opportunityId);

  try {
    return {
      configured: true,
      ...(await sendEmail(preview.subject, preview.text)),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to send opportunity email.';

    logger.error('Failed to send opportunity email', {
      error: message,
      opportunityId,
    });

    throw new Error(message);
  }
}

export async function previewDailySummaryEmail() {
  const generatedAt = new Date();
  const opportunities = await db.opportunity.findMany({
    where: {
      status: 'REVIEWED',
    },
    include: {
      product: {
        select: {
          name: true,
        },
      },
      supplier: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
  });

  return {
    configured: isEmailConfigured(),
    recipients: env.internalAlertEmailRecipients,
    subject: buildDailySummaryEmailSubject(generatedAt),
    text: buildDailySummaryMessage(opportunities, generatedAt),
  };
}

export async function sendDailySummaryEmail() {
  const preview = await previewDailySummaryEmail();

  try {
    return {
      configured: true,
      ...(await sendEmail(preview.subject, preview.text)),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to send daily summary email.';

    logger.error('Failed to send daily summary email', {
      error: message,
    });

    throw new Error(message);
  }
}
