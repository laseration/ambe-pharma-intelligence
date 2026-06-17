'use client';

import { useActionState } from 'react';

import {
  createAccountOpeningCaseAction,
  type CreateCaseFormState,
} from './actions';
import { NewCaseForm } from './NewCaseForm';

const INITIAL_STATE: CreateCaseFormState = { error: null };

export function NewCaseFormClient() {
  const [state, formAction, pending] = useActionState(
    createAccountOpeningCaseAction,
    INITIAL_STATE,
  );

  return (
    <NewCaseForm action={formAction} error={state.error} pending={pending} />
  );
}
