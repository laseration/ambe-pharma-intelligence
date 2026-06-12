'use client';

import { useActionState } from 'react';

import type { TradeAccessFormState } from './state';

type TradeAccessFormProps = {
  action: (
    state: TradeAccessFormState,
    formData: FormData,
  ) => Promise<TradeAccessFormState>;
  initialState: TradeAccessFormState;
};

type TextFieldProps = {
  name: keyof TradeAccessFormState['values'];
  label: string;
  state: TradeAccessFormState;
  autoComplete?: string;
  helpText?: string;
  required?: boolean;
  type?: 'text' | 'email' | 'tel' | 'date';
};

type TextAreaProps = {
  name: keyof TradeAccessFormState['values'];
  label: string;
  state: TradeAccessFormState;
  helpText?: string;
};

function FieldMessage({
  id,
  message,
}: {
  id: string;
  message: string | undefined;
}) {
  return message ? (
    <p className="public-rfq-field-error" id={id}>
      {message}
    </p>
  ) : null;
}

function TextField({
  name,
  label,
  state,
  autoComplete,
  helpText,
  required = false,
  type = 'text',
}: TextFieldProps) {
  const error = state.errors[name];
  const descriptionId = `trade-access-${name}-description`;
  const errorId = `trade-access-${name}-error`;

  return (
    <label className="public-rfq-field" htmlFor={`trade-access-${name}`}>
      <span>
        {label}
        {required ? <small>Required</small> : null}
      </span>
      <input
        aria-describedby={
          error ? errorId : helpText ? descriptionId : undefined
        }
        aria-invalid={error ? 'true' : undefined}
        autoComplete={autoComplete}
        defaultValue={state.values[name]}
        id={`trade-access-${name}`}
        name={name}
        required={required}
        type={type}
      />
      {helpText ? (
        <small className="public-rfq-help" id={descriptionId}>
          {helpText}
        </small>
      ) : null}
      <FieldMessage id={errorId} message={error} />
    </label>
  );
}

function TextArea({ name, label, state, helpText }: TextAreaProps) {
  const error = state.errors[name];
  const descriptionId = `trade-access-${name}-description`;
  const errorId = `trade-access-${name}-error`;

  return (
    <label
      className="public-rfq-field public-rfq-field-wide"
      htmlFor={`trade-access-${name}`}
    >
      <span>{label}</span>
      <textarea
        aria-describedby={
          error ? errorId : helpText ? descriptionId : undefined
        }
        aria-invalid={error ? 'true' : undefined}
        defaultValue={state.values[name]}
        id={`trade-access-${name}`}
        name={name}
        rows={4}
      />
      {helpText ? (
        <small className="public-rfq-help" id={descriptionId}>
          {helpText}
        </small>
      ) : null}
      <FieldMessage id={errorId} message={error} />
    </label>
  );
}

export function TradeAccessForm({
  action,
  initialState,
}: TradeAccessFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="public-rfq-form" noValidate>
      {state.message ? (
        <p
          className={`public-rfq-message public-rfq-message-${state.status}`}
          role={state.status === 'error' ? 'alert' : 'status'}
        >
          {state.message}
        </p>
      ) : null}

      <div className="public-rfq-grid">
        <label
          aria-hidden="true"
          className="public-rfq-honeypot"
          htmlFor="trade-access-website"
        >
          Website
          <input
            autoComplete="off"
            defaultValue={state.values.website}
            id="trade-access-website"
            name="website"
            tabIndex={-1}
            type="text"
          />
        </label>
        <TextField
          autoComplete="organization"
          label="Company name"
          name="companyName"
          required
          state={state}
        />
        <TextField
          autoComplete="name"
          label="Contact name"
          name="contactName"
          required
          state={state}
        />
        <TextField
          autoComplete="email"
          label="Business email"
          name="contactEmail"
          required
          state={state}
          type="email"
        />
        <TextField
          autoComplete="tel"
          label="Phone"
          name="contactPhone"
          state={state}
          type="tel"
        />
        <TextField
          label="Business type"
          name="businessType"
          state={state}
          helpText="For example pharmacy, wholesaler, clinical buyer, manufacturer, or supplier."
        />
        <TextField label="Country" name="country" state={state} />
        <TextField
          label="Product or comparator requirement"
          name="productName"
          required
          state={state}
        />
        <TextField label="Strength" name="strength" state={state} />
        <TextField label="Pack size" name="packSize" state={state} />
        <TextField
          label="Quantity"
          name="quantityRequired"
          state={state}
          helpText="Use the buying unit you normally work with."
        />
        <TextField label="Target market" name="targetMarket" state={state} />
        <TextField
          label="Required by"
          name="requiredBy"
          state={state}
          type="date"
        />
        <TextArea
          label="Documentation notes"
          name="documentationNotes"
          state={state}
          helpText="Include account status, licence checks, comparator documentation, or import/export context where relevant."
        />
        <TextArea
          label="Additional context"
          name="additionalNotes"
          state={state}
          helpText="Add timing, sourcing constraints, or commercial context. Do not include sensitive personal data."
        />
      </div>

      <div className="public-rfq-actions">
        <button
          className="public-button public-button-primary"
          disabled={isPending}
          type="submit"
        >
          {isPending ? 'Submitting requirement' : 'Submit requirement'}
        </button>
        <p>
          Submission creates a manual review enquiry only. It does not confirm
          supply, price, allocation, account approval, or order placement.
        </p>
      </div>
    </form>
  );
}
