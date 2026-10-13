import type { Metadata } from "next";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { ActionForm } from "@/components/ActionForm";
import { getCurrentRound, hasSubmitted, loadRoundContext } from "@/lib/rounds";
import { addDoctorAction, removeDoctorAction, updateDoctorAction } from "../actions";

export const metadata: Metadata = { title: "Doctors" };

export default async function Doctors() {
  await requireAdmin();
  await connection();
  const round = await getCurrentRound();
  const ctx = await loadRoundContext(round);

  return (
    <div>
      <h1>Doctors<small className="muted" style={{ fontSize: 14, marginLeft: 8 }}>order of merit</small></h1>
      <p className="muted small">Names were read from a photo of the PDF. Please double-check the spelling.</p>
      {ctx.candidates.map((c) => (
        <div className={`card${c.active ? "" : " off"}`} key={c.id} style={{ marginBottom: 10 }}>
          <div className="inline" style={{ justifyContent: "space-between" }}>
            <strong className="num">#{c.order}</strong>
            <span className="muted small">{c.indexNo}</span>
            <span className="small">
              {hasSubmitted(ctx, c.id) ? "submitted ✓" : ctx.choices.get(c.id) ? "incomplete" : "not submitted"}
            </span>
          </div>
          <ActionForm action={updateDoctorAction} submit="Save name" buttonClass="small secondary" className="inline">
            <input type="hidden" name="id" value={c.id} />
            <input name="name" defaultValue={c.name} aria-label="Name" maxLength={200} />
          </ActionForm>
          <div className="row-actions" style={{ marginTop: 8 }}>
            <ActionForm action={updateDoctorAction} submit={c.active ? "Mark withdrawn" : "Mark active"} buttonClass="small secondary">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="active" value={c.active ? "false" : "true"} />
            </ActionForm>
            <ActionForm action={removeDoctorAction} submit="Remove" buttonClass="small danger" confirmText={`Remove #${c.order} ${c.name} completely, including their choices and results?`}>
              <input type="hidden" name="id" value={c.id} />
            </ActionForm>
          </div>
        </div>
      ))}

      <section className="section">
        <h2>Add a doctor</h2>
        <ActionForm action={addDoctorAction} submit="Add">
          <input name="order" type="number" min={1} placeholder="Merit position" aria-label="Merit position" required />
          <input name="indexNo" placeholder="Index number" aria-label="Index number" required />
          <input name="name" placeholder="Full name" aria-label="Full name" required />
        </ActionForm>
      </section>
    </div>
  );
}
