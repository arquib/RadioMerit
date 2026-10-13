"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={formAction} className="form">
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" autoFocus required />
      {state.error && <p className="form-error" aria-live="polite">{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? "Checking…" : "Continue"}</button>
    </form>
  );
}
