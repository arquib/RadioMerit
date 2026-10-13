"use client";

import { useActionState, useState } from "react";
import { saveChoicesAction } from "./actions";
import type { Result } from "@/lib/result";

type C = { id: string; name: string; seats: number };
type H = { id: string; name: string; vacancies: number; consultants: C[] };
const LABEL = ["1st choice", "2nd choice", "3rd choice"];

export function ChoiceForm({ hospitals, required, initial, initialConsultants }: { hospitals: H[]; required: number; initial: string[]; initialConsultants: (string | null)[] }) {
  const [state, formAction, pending] = useActionState<Result | null, FormData>(saveChoicesAction, null);
  const [picked, setPicked] = useState<string[]>(Array.from({ length: required }, (_, i) => initial[i] ?? ""));
  const [cons, setCons] = useState<string[]>(Array.from({ length: required }, (_, i) => initialConsultants[i] ?? ""));
  const byId = new Map(hospitals.map((h) => [h.id, h]));

  return (
    <form action={formAction} className="form">
      {picked.map((value, i) => {
        const list = byId.get(value)?.consultants ?? [];
        return (
          <fieldset key={i} className="choice-row">
            <label htmlFor={`choice-${i}`}>{LABEL[i]}</label>
            <select
              id={`choice-${i}`}
              name="choice"
              value={value}
              required
              onChange={(e) => {
                setPicked(picked.map((p, j) => (j === i ? e.target.value : p)));
                setCons(cons.map((c, j) => (j === i ? "" : c))); // a new hospital resets the consultant to "any"
              }}
            >
              <option value="">Select a hospital…</option>
              {hospitals.map((h) => (
                <option key={h.id} value={h.id} disabled={picked.some((p, j) => j !== i && p === h.id)}>
                  {h.name} ({h.vacancies} seat{h.vacancies === 1 ? "" : "s"})
                </option>
              ))}
            </select>
            {value && list.length > 0 ? (
              <select name="consultant" value={cons[i]} onChange={(e) => setCons(cons.map((c, j) => (j === i ? e.target.value : c)))} aria-label={`Consultant for ${LABEL[i]}`} className="consultant-select">
                <option value="">Any consultant</option>
                {list.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.seats > 1 ? ` (${c.seats} seats)` : ""}</option>
                ))}
              </select>
            ) : (
              <input type="hidden" name="consultant" value="" />
            )}
          </fieldset>
        );
      })}
      <button type="submit" disabled={pending || picked.some((p) => !p)}>{pending ? "Saving…" : initial.length ? "Update my choices" : "Save my choices"}</button>
      {state?.message && <p className={state.ok ? "form-ok" : "form-error"} aria-live="polite">{state.message}</p>}
    </form>
  );
}
