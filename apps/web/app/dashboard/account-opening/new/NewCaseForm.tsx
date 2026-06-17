import React from 'react';

type NewCaseFormProps = {
  action: (formData: FormData) => void;
  error?: string | null;
  pending?: boolean;
};

/**
 * Presentational new-case form. Kept free of hooks and of the server-only
 * action module so it can be unit-tested directly; the `useActionState` wiring
 * lives in NewCaseFormClient.
 */
export function NewCaseForm({ action, error, pending }: NewCaseFormProps) {
  return (
    <form action={action} className="action-form">
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}

      <label>
        Counterparty name
        <input
          name="counterpartyName"
          placeholder="Supplier or customer legal name"
          required
          type="text"
        />
      </label>

      <label>
        Counterparty email (optional)
        <input
          name="counterpartyEmail"
          placeholder="contact@company.example"
          type="email"
        />
      </label>

      <label>
        Case type
        <select defaultValue="UNKNOWN" name="caseType">
          <option value="SUPPLIER_ONBOARDING">Supplier onboarding</option>
          <option value="CUSTOMER_ONBOARDING">Customer onboarding</option>
          <option value="UNKNOWN">Unknown</option>
        </select>
      </label>

      <label>
        Internal note (optional)
        <textarea
          name="internalNote"
          placeholder="Short context for reviewers."
          rows={3}
        />
        <small className="copy">
          Short context for reviewers. Do not paste bank details.
        </small>
      </label>

      <button
        className="button button-primary"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Creating…' : 'Create case'}
      </button>
    </form>
  );
}
