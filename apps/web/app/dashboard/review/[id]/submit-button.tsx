'use client';

import { useFormStatus } from 'react-dom';

type SubmitButtonProps = {
  className?: string;
  disabled?: boolean;
  disabledReason?: string;
  idleLabel: string;
  name?: string;
  pendingLabel: string;
  value?: string;
};

export function SubmitButton({
  className,
  disabled = false,
  disabledReason,
  idleLabel,
  name,
  pendingLabel,
  value,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending}
      className={className}
      disabled={pending || disabled}
      name={name}
      title={disabled ? disabledReason : undefined}
      type="submit"
      value={value}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
