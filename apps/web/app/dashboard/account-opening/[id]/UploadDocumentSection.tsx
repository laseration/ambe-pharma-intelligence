'use client';

import { useActionState } from 'react';

import {
  uploadAccountOpeningDocumentAction,
  type UploadDocumentFormState,
} from './actions';
import { UploadDocumentForm } from './UploadDocumentForm';

const INITIAL_STATE: UploadDocumentFormState = {
  error: null,
  classification: null,
  fileName: null,
  supplierName: null,
};

export function UploadDocumentSection({ caseId }: { caseId: string }) {
  const action = uploadAccountOpeningDocumentAction.bind(null, caseId);
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <UploadDocumentForm
      action={formAction}
      error={state.error}
      classification={state.classification}
      fileName={state.fileName}
      supplierName={state.supplierName}
      pending={pending}
    />
  );
}
