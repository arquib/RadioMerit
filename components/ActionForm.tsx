"use client";

import { useActionState } from "react";
import type { Result } from "@/lib/result";

type Props = {
  action: (prev: Result | null, fd: FormData) => Promise<Result>;
  submit: string;
  pending?: string;
  children?: React.ReactNode;
  className?: string;
  buttonClass?: string;
  confirmText?: string;
};

/** A form for a Server Action that returns {ok, message}: shows progress and the result. */
export function ActionForm({ action, submit, pending, children, className = "form", buttonClass, confirmText }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  return (
    <form action={formAction} className={className} onSubmit={(e) => { if (confirmText && !window.confirm(confirmText)) e.preventDefault(); }}>
      {children}
      <button type="submit" disabled={isPending} className={buttonClass}>{isPending ? pending ?? "Working…" : submit}</button>
      {state?.message && <p className={state.ok ? "form-ok" : "form-error"} aria-live="polite">{state.message}</p>}
    </form>
  );
}
