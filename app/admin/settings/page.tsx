import type { Metadata } from "next";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { ActionForm } from "@/components/ActionForm";
import { getCurrentRound } from "@/lib/rounds";
import { toColomboInput } from "@/lib/time";
import { deadlineAction, resetEverythingAction } from "../actions";

export const metadata: Metadata = { title: "Settings" };

export default async function Settings() {
  await requireAdmin();
  await connection();
  const round = await getCurrentRound();
  return (
    <div>
      <h1>Settings</h1>

      <section className="section">
        <h2>Deadline<small>Sri Lanka time</small></h2>
        <ActionForm action={deadlineAction} submit="Save deadline" className="inline">
          <input type="datetime-local" name="deadline" defaultValue={toColomboInput(round.deadline)} aria-label="Deadline" />
        </ActionForm>
        <p className="muted small">After the deadline doctors cannot change their choices, even before you lock the round. Leave empty for none.</p>
      </section>

      <section className="section">
        <h2>Danger zone</h2>
        <p>Removes all choices and results and puts the allocation back to draft. Hospitals and doctors are kept. Use it after a rehearsal.</p>
        <ActionForm action={resetEverythingAction} submit="Reset everything" buttonClass="danger" confirmText="Really delete all choices and results?">
          <label htmlFor="confirm">Type RESET to confirm</label>
          <input id="confirm" name="confirm" autoComplete="off" />
        </ActionForm>
      </section>
    </div>
  );
}
