'use server';

import { submitPublicTradeEnquiry } from '../../lib/publicTradeApi';
import {
  emptyTradeAccessFormValues,
  validateTradeAccessForm,
} from '../../lib/tradeAccessValidation';
import type { TradeAccessFormState } from './state';

export async function submitTradeAccessRequirementAction(
  _previousState: TradeAccessFormState,
  formData: FormData,
): Promise<TradeAccessFormState> {
  const validation = validateTradeAccessForm(formData);

  if (!validation.valid) {
    return {
      status: 'error',
      message: 'Check the highlighted fields before submitting the enquiry.',
      errors: validation.errors,
      values: validation.values,
    };
  }

  try {
    await submitPublicTradeEnquiry(validation.values);

    return {
      status: 'success',
      message:
        'Requirement received. Ambe will review availability, pricing, timing, and documentation manually before any next step.',
      errors: {},
      values: emptyTradeAccessFormValues,
    };
  } catch {
    return {
      status: 'error',
      message:
        'The enquiry could not be submitted. Please email Ambe Medical Group with the same details.',
      errors: {},
      values: validation.values,
    };
  }
}
