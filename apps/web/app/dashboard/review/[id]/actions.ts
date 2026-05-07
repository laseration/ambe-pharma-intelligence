'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  listReviewWorkflowItems,
  runReviewWorkflowPolicyCheck,
  type ReviewWorkflowActionOutcome,
  updateReviewWorkflowItem,
} from '../../../../lib/reviewApi';

function value(formData: FormData, key: string): string {
  const rawValue = formData.get(key);
  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function buildSupplierDetails(formData: FormData): Record<string, string | null> | undefined {
  const supplierDetails = {
    supplierName: value(formData, 'supplierName') || null,
    contactName: value(formData, 'supplierContactName') || null,
    email: value(formData, 'supplierEmail') || null,
    phone: value(formData, 'supplierPhone') || null,
  };

  return Object.values(supplierDetails).some(Boolean) ? supplierDetails : undefined;
}

function sanitizeReturnTo(value: string | null | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed || !trimmed.startsWith('/dashboard')) {
    return '/dashboard/review';
  }

  if (trimmed.startsWith('//') || trimmed.includes('://')) {
    return '/dashboard/review';
  }

  return trimmed;
}

function buildReviewRedirectTarget(
  inboundEmailId: string,
  params: Record<string, string>,
  returnTo: string,
): string {
  const searchParams = new URLSearchParams(params);
  searchParams.set('returnTo', returnTo);
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

  if (action === 'APPROVE_TO_BUY' && /promotion blocked by staged-offer safety checks/i.test(message)) {
    return 'Approval is blocked. Check the promotion safety section for the fields or policy findings that need resolving.';
  }

  return message || 'Workflow action failed.';
}

function buildApprovalMessage(outcomes: ReviewWorkflowActionOutcome[]): {
  message: string;
  dealId?: string;
} {
  const createdDeal = outcomes.find((outcome) => outcome.tradeOpportunityOutcome === 'CREATED');
  const existingDeal = outcomes.find((outcome) => outcome.tradeOpportunityOutcome === 'EXISTING_ACTIVE');

  if (createdDeal?.tradeOpportunityId) {
    return {
      message: 'Approved. A deal opportunity was created from recent demand.',
      dealId: createdDeal.tradeOpportunityId,
    };
  }

  if (existingDeal?.tradeOpportunityId) {
    return {
      message: 'Approved. A deal opportunity was already open for this supplier offer.',
      dealId: existingDeal.tradeOpportunityId,
    };
  }

  const hasBuyDecisionCreated = outcomes.some((outcome) => outcome.buyDecisionCreated);
  const noDemand = outcomes.some((outcome) => outcome.tradeOpportunityOutcome === 'SKIPPED_NO_RECENT_DEMAND');
  const noMargin = outcomes.some((outcome) => outcome.tradeOpportunityOutcome === 'SKIPPED_NON_POSITIVE_MARGIN');

  if (noDemand) {
    return {
      message: hasBuyDecisionCreated
        ? 'Approved. A buy decision was created. No deal was created because no recent demand was found.'
        : 'Approved. No deal was created because no recent demand was found.',
    };
  }

  if (noMargin) {
    return {
      message: hasBuyDecisionCreated
        ? 'Approved. A buy decision was created. No deal was created because the margin was not positive.'
        : 'Approved. No deal was created because the margin was not positive.',
    };
  }

  if (hasBuyDecisionCreated) {
    return {
      message: 'Approved. A buy decision was created.',
    };
  }

  return {
    message: 'Approved.',
  };
}

function buildReviewSuccessRedirectTarget(
  inboundEmailId: string,
  params: Record<string, string>,
  returnTo: string,
): string {
  return buildReviewRedirectTarget(inboundEmailId, params, returnTo);
}

export async function submitInboundEmailReviewAction(formData: FormData) {
  const inboundEmailId = value(formData, 'inboundEmailId');
  const workflowItemId = value(formData, 'workflowItemId');
  const action = value(formData, 'action');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if ((!inboundEmailId && !workflowItemId) || !action) {
    redirect('/dashboard/review?error=Missing+review+action+input');
  }

  const note = value(formData, 'note') || undefined;
  const supplierDetails = buildSupplierDetails(formData);
  const allowQualificationRisk = formData.get('allowQualificationRisk') === 'on';
  const actorPayload = {
    actorType: 'OPERATOR',
    actorIdentifier: 'web-review-console',
  };
  const outcomes: ReviewWorkflowActionOutcome[] = [];

  try {
    const items = workflowItemId
      ? [{ id: workflowItemId }]
      : await listReviewWorkflowItems({ inboundEmailId });

    if (items.length === 0) {
      redirect(
        buildReviewRedirectTarget(inboundEmailId, {
          error: 'No open workflow items were found for this email.',
        }, returnTo),
      );
    }

    for (const item of items) {
      if (action === 'APPROVE_TO_BUY') {
        const result = await updateReviewWorkflowItem(item.id, {
          action,
          note,
          allowQualificationRisk,
          supplierDetails,
          ...actorPayload,
        });
        if (result.actionOutcome) {
          outcomes.push(result.actionOutcome);
        }
        continue;
      }

      const result = await updateReviewWorkflowItem(item.id, {
        action,
        note,
        ...actorPayload,
      });
      if (result.actionOutcome) {
        outcomes.push(result.actionOutcome);
      }
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
        }, returnTo),
      );
    }

    redirect(`/dashboard/review/${workflowItemId}?error=${encodeURIComponent(message)}&returnTo=${encodeURIComponent(returnTo)}`);
  }

  revalidatePath('/dashboard/review');
  revalidatePath('/dashboard/deals');

  const successPayload =
    action === 'APPROVE_TO_BUY'
      ? buildApprovalMessage(outcomes)
      : {
          message: 'Rejected.',
        };

  if (inboundEmailId) {
    const remainingItems = await listReviewWorkflowItems({ inboundEmailId });
    revalidatePath(`/dashboard/review/${inboundEmailId}`);
    if (remainingItems.length === 0) {
      const searchParams = new URLSearchParams({
        updated: action,
        message: successPayload.message,
      });
      if (successPayload.dealId) {
        searchParams.set('dealId', successPayload.dealId);
      }
      redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}${searchParams.toString()}`);
    }
    const nextParams: Record<string, string> = {
      updated: action,
      message: successPayload.message,
    };
    if (successPayload.dealId) {
      nextParams.dealId = successPayload.dealId;
    }
    redirect(buildReviewSuccessRedirectTarget(inboundEmailId, nextParams, returnTo));
  }

  const searchParams = new URLSearchParams({
    updated: action,
    message: successPayload.message,
  });
  if (successPayload.dealId) {
    searchParams.set('dealId', successPayload.dealId);
  }
  redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}${searchParams.toString()}`);
}

export async function runStagedOfferPolicyCheckAction(formData: FormData) {
  const inboundEmailId = value(formData, 'inboundEmailId');
  const workflowItemId = value(formData, 'workflowItemId');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!workflowItemId) {
    redirect('/dashboard/review?error=Missing+policy+check+input');
  }

  try {
    await runReviewWorkflowPolicyCheck(workflowItemId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Policy check failed.';
    redirect(
      inboundEmailId
        ? buildReviewRedirectTarget(inboundEmailId, { error: message }, returnTo)
        : `/dashboard/review/${workflowItemId}?error=${encodeURIComponent(message)}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  revalidatePath('/dashboard/review');
  if (inboundEmailId) {
    revalidatePath(`/dashboard/review/${inboundEmailId}`);
    redirect(
      buildReviewSuccessRedirectTarget(
        inboundEmailId,
        {
          updated: 'POLICY_CHECK',
          message: 'Policy check updated.',
        },
        returnTo,
      ),
    );
  }

  redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}updated=POLICY_CHECK&message=Policy+check+updated.`);
}
