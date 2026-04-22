'use client';

import { useFormStatus } from 'react-dom';

type SubmitButtonProps = {
  className?: string;
  idleLabel: string;
  pendingLabel: string;
};

export function SubmitButton({ className, idleLabel, pendingLabel }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending}
      className={className}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
