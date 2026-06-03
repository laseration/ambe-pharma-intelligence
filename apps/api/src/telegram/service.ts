import crypto from 'node:crypto';

import { Prisma } from '@prisma/client';
import type { Opportunity, TelegramPost } from '@prisma/client';

import { env } from '../config/env';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { assertOpportunityReviewedForNotification } from '../safety/commercialApprovalGuard';
import { buildDailySummaryMessage, buildOpportunityMessage } from './templates';

const INTERNAL_CHANNEL_KEY = 'internal-ops';

type OpportunityWithRelations = Opportunity & {
  product: { name: string } | null;
  supplier: { name: string } | null;
};

function hashMessage(messageText: string): string {
  return crypto.createHash('sha256').update(messageText).digest('hex');
}

function isTelegramConfigured(): boolean {
  return Boolean(env.telegramBotToken && env.telegramInternalChatId);
}

function hasTelegramBotToken(): boolean {
  return Boolean(env.telegramBotToken);
}

function isDryRun(): boolean {
  return env.telegramDryRun;
}

function createConfigError(): Error {
  return new Error(
    'Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_INTERNAL_CHAT_ID to enable publishing.',
  );
}

function createBotConfigError(): Error {
  return new Error('Telegram bot token is not configured.');
}

async function createTelegramPostRecord(input: {
  opportunityId?: string;
  messageText: string;
  contentHash: string;
  status: TelegramPost['status'];
  telegramMessageId?: string;
  errorMessage?: string;
  metadata?: Prisma.InputJsonValue;
  sentAt?: Date;
}): Promise<TelegramPost> {
  return db.telegramPost.create({
    data: {
      opportunityId: input.opportunityId,
      channelKey: INTERNAL_CHANNEL_KEY,
      status: input.status,
      messageText: input.messageText,
      contentHash: input.contentHash,
      telegramMessageId: input.telegramMessageId,
      errorMessage: input.errorMessage,
      sentAt: input.sentAt,
      metadata: input.metadata,
    },
  });
}

export async function sendTelegramText(
  chatId: string,
  messageText: string,
  replyToMessageId?: number,
) {
  if (!hasTelegramBotToken()) {
    throw createBotConfigError();
  }

  const endpoint = `https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: messageText,
      ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    }),
  });

  const payload = (await response.json()) as {
    ok?: boolean;
    description?: string;
    result?: { message_id?: number };
  };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || 'Telegram API request failed.');
  }

  return {
    telegramMessageId: payload.result?.message_id?.toString() ?? null,
  };
}

async function findOpportunityForPublishing(opportunityId: string) {
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

async function hasUnchangedPublishedPost(
  opportunityId: string,
  contentHash: string,
): Promise<boolean> {
  const existing = await db.telegramPost.findFirst({
    where: {
      opportunityId,
      channelKey: INTERNAL_CHANNEL_KEY,
      status: 'SENT',
      contentHash,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return Boolean(existing);
}

export async function previewOpportunityMessage(opportunityId: string) {
  const opportunity = await findOpportunityForPublishing(opportunityId);

  if (!opportunity) {
    throw new Error('Opportunity not found.');
  }
  assertOpportunityReviewedForNotification(opportunity);

  const messageText = buildOpportunityMessage(opportunity);

  return {
    opportunityId: opportunity.id,
    dryRun: isDryRun(),
    messageText,
  };
}

export async function publishOpportunity(opportunityId: string) {
  const opportunity = await findOpportunityForPublishing(opportunityId);

  if (!opportunity) {
    throw new Error('Opportunity not found.');
  }
  assertOpportunityReviewedForNotification(opportunity);

  const messageText = buildOpportunityMessage(opportunity);
  const contentHash = hashMessage(messageText);

  if (await hasUnchangedPublishedPost(opportunity.id, contentHash)) {
    logger.info(
      'Skipped Telegram publish because opportunity message is unchanged',
      {
        opportunityId: opportunity.id,
        type: opportunity.type,
      },
    );

    return {
      dryRun: isDryRun(),
      messageText,
      skipped: true,
    };
  }

  if (!isTelegramConfigured()) {
    throw createConfigError();
  }

  if (isDryRun()) {
    logger.info('Telegram dry-run publish', {
      opportunityId: opportunity.id,
      type: opportunity.type,
    });

    const post = await createTelegramPostRecord({
      opportunityId: opportunity.id,
      messageText,
      contentHash,
      status: 'SENT',
      sentAt: new Date(),
      metadata: {
        dryRun: true,
      },
    });

    return {
      dryRun: true,
      messageText,
      post,
      skipped: false,
    };
  }

  try {
    const result = await sendTelegramText(
      env.telegramInternalChatId,
      messageText,
    );
    const post = await createTelegramPostRecord({
      opportunityId: opportunity.id,
      messageText,
      contentHash,
      status: 'SENT',
      telegramMessageId: result.telegramMessageId ?? undefined,
      sentAt: new Date(),
      metadata: {
        dryRun: false,
      },
    });

    logger.info('Telegram publish succeeded', {
      opportunityId: opportunity.id,
      telegramMessageId: result.telegramMessageId,
      type: opportunity.type,
    });

    return {
      dryRun: false,
      messageText,
      post,
      skipped: false,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Telegram publish failed.';

    const post = await createTelegramPostRecord({
      opportunityId: opportunity.id,
      messageText,
      contentHash,
      status: 'FAILED',
      errorMessage: message,
      metadata: {
        dryRun: false,
      },
    });

    logger.error('Telegram publish failed', {
      error: message,
      opportunityId: opportunity.id,
      type: opportunity.type,
    });

    return {
      dryRun: false,
      messageText,
      post,
      skipped: false,
      error: message,
    };
  }
}

export async function publishOpenOpportunities() {
  const opportunities = await db.opportunity.findMany({
    where: {
      status: 'REVIEWED',
    },
    orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
  });

  const results = [];

  for (const opportunity of opportunities) {
    results.push(await publishOpportunity(opportunity.id));
  }

  return {
    count: results.length,
    results,
  };
}

export async function previewDailySummary() {
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
    dryRun: isDryRun(),
    messageText: buildDailySummaryMessage(
      opportunities as OpportunityWithRelations[],
      new Date(),
    ),
  };
}
