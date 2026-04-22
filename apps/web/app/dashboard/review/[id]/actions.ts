'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { listReviewWorkflowItems, updateReviewWorkflowItem } from '../../../../lib/reviewApi';

function value(formData: FormData, key: string): string {
  const rawValue = formData.get(key);
  return typeof rawValue === 'string' ? rawValue.trim() : '';
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
      redirect(`/dashboard/review/${inboundEmailId}?error=No+open+workflow+items+found`);
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
    const message = error instanceof Error ? error.message : 'Workflow action failed.';
    redirect(`/dashboard/review/${inboundEmailId || workflowItemId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath('/dashboard/review');
  if (inboundEmailId) {
    revalidatePath(`/dashboard/review/${inboundEmailId}`);
    redirect(`/dashboard/review/${inboundEmailId}?updated=${encodeURIComponent(action)}`);
  }

  redirect('/dashboard/review?updated=row_action');
}
