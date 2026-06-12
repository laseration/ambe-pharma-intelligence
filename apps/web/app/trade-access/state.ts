import {
  emptyTradeAccessFormValues,
  type TradeAccessFormErrors,
  type TradeAccessFormValues,
} from '../../lib/tradeAccessValidation';

export type TradeAccessFormState = {
  status: 'idle' | 'success' | 'error';
  message: string | null;
  errors: TradeAccessFormErrors;
  values: TradeAccessFormValues;
};

export const initialTradeAccessFormState: TradeAccessFormState = {
  status: 'idle',
  message: null,
  errors: {},
  values: emptyTradeAccessFormValues,
};
