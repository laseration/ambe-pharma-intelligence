'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  createReviewWorkflowCorrection,
  listReviewWorkflowItems,
  type ReviewWorkflowActionOutcome,
  updateReviewWorkflowItem,
} from '../../../../lib/reviewApi';

function value(formData: FormData, key: string): string {
  const rawValue = formData.get(key);
  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function optionalValue(formData: FormData, key: string): string | undefined {
  const trimmed = value(formData, key);
  return trimmed || undefined;
}

function optionalNumber(formData: FormData, key: string): number | undefined {
  const rawValue = optionalValue(formData, key);
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildSupplierDetails(
  formData: FormData,
): Record<string, string | null> | undefined {
  const supplierDetails = {
    supplierName: value(formData, 'supplierName') || null,
    contactName: value(formData, 'supplierContactName') || null,
    email: value(formData, 'supplierEmail') || null,
    phone: value(formData, 'supplierPhone') || null,
  };

  return Object.values(supplierDetails).some(Boolean)
    ? supplierDetails
    : undefined;
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

function formatReviewActionErrorMessage(
  message: string,
  action: string,
): string {
  if (
    action === 'APPROVE_TO_BUY' &&
    /qualification risk requires explicit operator confirmation/i.test(message)
  ) {
    return 'Supplier needs checking before approval. The supplier was detected, but it has not been matched to an approved supplier record yet. Use the checkbox below if you intentionally want to continue.';
  }

  if (
    action === 'APPROVE_TO_BUY' &&
    /blocked supplier cannot be approved to buy/i.test(message)
  ) {
    return 'Approval is blocked. The supplier is currently blocked and must be reviewed before you can continue.';
  }

  return message || 'Workflow action failed.';
}

function buildApprovalMessage(outcomes: ReviewWorkflowActionOutcome[]): {
  message: string;
  dealId?: string;
} {
  const createdDeal = outcomes.find(
    (outcome) => outcome.tradeOpportunityOutcome === 'CREATED',
  );
  const existingDeal = outcomes.find(
    (outcome) => outcome.tradeOpportunityOutcome === 'EXISTING_ACTIVE',
  );

  if (createdDeal?.tradeOpportunityId) {
    return {
      message: 'Approved. A deal opportunity was created from recent demand.',
      dealId: createdDeal.tradeOpportunityId,
    };
  }

  if (existingDeal?.tradeOpportunityId) {
    return {
      message:
        'Approved. A deal opportunity was already open for this supplier offer.',
      dealId: existingDeal.tradeOpportunityId,
    };
  }

  const hasBuyDecisionCreated = outcomes.some(
    (outcome) => outcome.buyDecisionCreated,
  );
  const noDemand = outcomes.some(
    (outcome) => outcome.tradeOpportunityOutcome === 'SKIPPED_NO_RECENT_DEMAND',
  );
  const noMargin = outcomes.some(
    (outcome) =>
      outcome.tradeOpportunityOutcome === 'SKIPPED_NON_POSITIVE_MARGIN',
  );

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

function buildNonApprovalMessage(action: string): string {
  if (action === 'REJECT') {
    return 'Rejected.';
  }

  if (action === 'NEEDS_INFO') {
    return 'Marked as needing more information.';
  }

  if (action === 'ADD_NOTE') {
    return 'Note added.';
  }

  return 'Saved.';
}

function buildCorrectionBody(formData: FormData): Record<string, unknown> {
  const body: Record<string, unknown> = {
    correctedSupplierName: optionalValue(formData, 'correctedSupplierName'),
    correctedRawProductText: optionalValue(formData, 'correctedRawProductText'),
    correctedNormalizedProductName: optionalValue(
      formData,
      'correctedNormalizedProductName',
    ),
    correctedManufacturer: optionalValue(formData, 'correctedManufacturer'),
    correctedUnitPrice: optionalValue(formData, 'correctedUnitPrice'),
    correctedCurrencyCode: optionalValue(formData, 'correctedCurrencyCode'),
    correctedMinimumOrderQuantity: optionalNumber(
      formData,
      'correctedMinimumOrderQuantity',
    ),
    correctedAvailability: optionalValue(formData, 'correctedAvailability'),
    note: optionalValue(formData, 'note'),
    actorType: 'OPERATOR',
    actorIdentifier: 'web-review-console',
  };

  return Object.fromEntries(
    Object.entries(body).filter(([, fieldValue]) => fieldValue !== undefined),
  );
}

function buildReviewSuccessRedirectTarget(
  inboundEmailId: string,
  params: Record<string, string>,
  returnTo: string,
): string {
  return buildReviewRedirectTarget(inboundEmailId, params, returnTo);
}

export async function submitReviewOfferCorrection(formData: FormData) {
  const inboundEmailId = value(formData, 'inboundEmailId');
  const workflowItemId = value(formData, 'workflowItemId');
  const correctionNextAction = value(formData, 'correctionNextAction');
  const returnTo = sanitizeReturnTo(value(formData, 'returnTo'));

  if (!inboundEmailId || !workflowItemId) {
    redirect('/dashboard/review?error=Missing+correction+input');
  }

  const body = buildCorrectionBody(formData);
  const hasCorrectionInput = Object.keys(body).some(
    (key) => !['actorType', 'actorIdentifier'].includes(key),
  );

  if (!hasCorrectionInput) {
    redirect(
      buildReviewRedirectTarget(
        inboundEmailId,
        {
          error: 'Enter at least one correction field before saving.',
        },
        returnTo,
      ),
    );
  }

  try {
    await createReviewWorkflowCorrection(workflowItemId, body);
    if (correctionNextAction === 'APPROVE_TO_BUY') {
      await updateReviewWorkflowItem(workflowItemId, {
        action: 'APPROVE_TO_BUY',
        note: optionalValue(formData, 'approveNote') ?? body.note,
        allowQualificationRisk: true,
        actorType: 'OPERATOR',
        actorIdentifier: 'web-review-console',
      });
    }
  } catch (error) {
    redirect(
      buildReviewRedirectTarget(
        inboundEmailId,
        {
          error:
            error instanceof Error ? error.message : 'Offer correction failed.',
        },
        returnTo,
      ),
    );
  }

  revalidatePath('/dashboard/review');
  revalidatePath('/dashboard/deals');
  revalidatePath(`/dashboard/review/${inboundEmailId}`);
  if (correctionNextAction === 'APPROVE_TO_BUY') {
    const searchParams = new URLSearchParams({
      updated: 'CORRECTION_APPROVED',
      message:
        'Correction saved and offer approved. The buy decision uses the corrected commercial values.',
    });
    redirect(
      `${returnTo}${returnTo.includes('?') ? '&' : '?'}${searchParams.toString()}`,
    );
  }

  redirect(
    buildReviewSuccessRedirectTarget(
      inboundEmailId,
      {
        updated: 'CORRECTION',
        message:
          'Correction saved. It will be used as a bounded hint for future review, not as automatic approval.',
      },
      returnTo,
    ),
  );
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
  const allowQualificationRisk =
    formData.get('allowQualificationRisk') === 'on';
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
        buildReviewRedirectTarget(
          inboundEmailId,
          {
            error: 'No open workflow items were found for this email.',
          },
          returnTo,
        ),
      );
    }

    for (const item of items) {
      if (action === 'APPROVE_TO_BUY') {
        const result = await updateReviewWorkflowItem(item.id, {
          action,
          note,
          allowQualificationRisk: workflowItemId
            ? true
            : allowQualificationRisk,
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
        buildReviewRedirectTarget(
          inboundEmailId,
          {
            error: message,
          },
          returnTo,
        ),
      );
    }

    redirect(
      `/dashboard/review/${workflowItemId}?error=${encodeURIComponent(message)}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  revalidatePath('/dashboard/review');
  revalidatePath('/dashboard/deals');

  const successPayload =
    action === 'APPROVE_TO_BUY'
      ? buildApprovalMessage(outcomes)
      : {
          message: buildNonApprovalMessage(action),
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
      redirect(
        `${returnTo}${returnTo.includes('?') ? '&' : '?'}${searchParams.toString()}`,
      );
    }
    const nextParams: Record<string, string> = {
      updated: action,
      message: successPayload.message,
    };
    if (successPayload.dealId) {
      nextParams.dealId = successPayload.dealId;
    }
    redirect(
      buildReviewSuccessRedirectTarget(inboundEmailId, nextParams, returnTo),
    );
  }

  const searchParams = new URLSearchParams({
    updated: action,
    message: successPayload.message,
  });
  if (successPayload.dealId) {
    searchParams.set('dealId', successPayload.dealId);
  }
  redirect(
    `${returnTo}${returnTo.includes('?') ? '&' : '?'}${searchParams.toString()}`,
  );
}
