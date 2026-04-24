'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { listReviewWorkflowItems, updateReviewWorkflowItem } from '../../../../lib/reviewApi';

function value(formData: FormData, key: string): string {
  const rawValue = formData.get(key);
  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function buildReviewRedirectTarget(
  inboundEmailId: string,
  params: Record<string, string>,
): string {
  const searchParams = new URLSearchParams(params);
  return `/dashboard/review/${encodeURIComponent(inboundEmailId)}?${searchParams.toString()}#decision`;
}

function formatReviewActionErrorMessage(message: string, action: string): string {
  if (
    action === 'APPROVE_TO_BUY' &&
    /qualification risk requires explicit operator confirmation/i.test(message)
  ) {
    return 'Supplier needs checking before approval. The supplier was detected, but it has not been matched to an approved supplier record yet. Use the checkbox below if you intentionally want to continue.';
  }

  if (action === 'APPROVE_TO_BUY' && /blocked supplier cannot be approved to buy/i.test(message)) {
    return 'Approval is blocked. The supplier is currently blocked and must be reviewed before you can continue.';
  }

  return message || 'Workflow action failed.';
}

export async function submitInboundEmailReviewAction(formData: FormData) {
  const inboundEmailId = value(formData, 'inboundEmailId');
  const workflowItemId = value(formData, 'workflowItemId');
  const action = value(formData, 'action');

  if ((!inboundEmailId && !workflowItemId) || !action) {
    redirect('/dashboard/review?error=Missing+review+action+input');
  }

  const note = value(formData, 'note') || undefined;
  const allowQualificationRisk = formData.get('allowQualificationRisk') === 'on';
  const actorPayload = {
    actorType: 'OPERATOR',
    actorIdentifier: 'web-review-console',
  };

  try {
    const items = workflowItemId
      ? [{ id: workflowItemId }]
      : await listReviewWorkflowItems({ inboundEmailId });

    if (items.length === 0) {
      redirect(
        buildReviewRedirectTarget(inboundEmailId, {
          error: 'No open workflow items were found for this email.',
        }),
      );
    }

    for (const item of items) {
      if (action === 'APPROVE_TO_BUY') {
        await updateReviewWorkflowItem(item.id, {
          action,
          note,
          allowQualificationRisk: workflowItemId ? true : allowQualificationRisk,
          ...actorPayload,
        });
        continue;
      }

      await updateReviewWorkflowItem(item.id, {
        action,
        note,
        ...actorPayload,
      });
    }
  } catch (error) {
    const message = formatReviewActionErrorMessage(
      error instanceof Error ? error.message : 'Workflow action failed.',
      action,
    );

    if (inboundEmailId) {
      redirect(
        buildReviewRedirectTarget(inboundEmailId, {
          error: message,
        }),
      );
    }

    redirect(`/dashboard/review/${workflowItemId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath('/dashboard/review');
  if (inboundEmailId) {
    const remainingItems = await listReviewWorkflowItems({ inboundEmailId });
    revalidatePath(`/dashboard/review/${inboundEmailId}`);
    if (remainingItems.length === 0) {
      redirect(`/dashboard/review?updated=${encodeURIComponent(action)}`);
    }
    redirect(`/dashboard/review/${inboundEmailId}?updated=${encodeURIComponent(action)}`);
  }

  redirect('/dashboard/review?updated=row_action');
}
