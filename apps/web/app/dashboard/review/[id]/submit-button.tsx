'use client';

import { useFormStatus } from 'react-dom';

type SubmitButtonProps = {
  className?: string;
  idleLabel: string;
  name?: string;
  pendingLabel: string;
  value?: string;
};

export function SubmitButton({
  className,
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
      disabled={pending}
      name={name}
      type="submit"
      value={value}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
