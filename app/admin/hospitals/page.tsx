import type { Metadata } from "next";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { ActionForm } from "@/components/ActionForm";
import { getCurrentRound, liveResults, loadRoundContext, seatsTaken } from "@/lib/rounds";
import { addConsultantAction, addHospitalAction, deleteConsultantAction, deleteHospitalAction, moveHospitalAction, updateConsultantAction, updateHospitalAction } from "../actions";

export const metadata: Metadata = { title: "Hospitals" };

export default async function Hospitals() {
  await requireAdmin();
  await connection();
  const round = await getCurrentRound();
  const ctx = await loadRoundContext(round);
  const choices = await prisma.choice.findMany({ where: { roundId: round.id }, include: { candidate: true } });
  const manualIn = new Set(ctx.overrides.map((a) => a.hospitalId));
  const taken = seatsTaken(liveResults(ctx));
  const started = round.status !== "DRAFT";
  const totalSeats = ctx.hospitals.reduce((n, h) => n + h.vacancies, 0);
  const doctors = ctx.candidates.filter((c) => c.active).length;

  return (
    <div>
      <h1>Hospitals</h1>
      <div className={`banner ${totalSeats < doctors ? "bad" : "good"}`}>
        Total seats <strong>{totalSeats}</strong> · active doctors <strong>{doctors}</strong>
        {totalSeats < doctors && <> — {doctors - totalSeats} doctor{doctors - totalSeats === 1 ? "" : "s"} will not get a seat.</>}
      </div>
      <p className="muted small">Changes apply at once: doctors see the new seats and the updated live allocation within 10 seconds.</p>
      {round.status === "PUBLISHED" && <div className="banner warn">The allocation is published as final. Changing hospitals or seats here changes everyone&rsquo;s final result immediately.</div>}

      <section className="section">
        <h2>Add a hospital</h2>
        <ActionForm action={addHospitalAction} submit="Add" className="inline">
          <input name="name" placeholder="Hospital name" aria-label="Hospital name" required maxLength={120} />
          <input name="vacancies" type="number" min={0} max={999} placeholder="Seats" aria-label="Vacancies" required style={{ maxWidth: 110 }} />
        </ActionForm>
      </section>

      <section className="section">
        <h2>{ctx.hospitals.length} hospital{ctx.hospitals.length === 1 ? "" : "s"}<small>shown to doctors in this order</small></h2>
        {ctx.hospitals.map((h, i) => {
          const affected = choices.filter((c) => c.hospitalId === h.id).map((c) => `#${c.candidate.order} ${c.candidate.name}`);
          const cons = ctx.consultants.filter((c) => c.hospitalId === h.id);
          const consSeats = cons.reduce((n, c) => n + c.seats, 0);
          const wantedBy = (id: string) => choices.filter((c) => c.consultantId === id).length;
          const locked = manualIn.has(h.id);
          return (
            <div className="card" key={h.id} style={{ marginBottom: 10 }}>
              <ActionForm action={updateHospitalAction} submit="Rename" buttonClass="small secondary" className="inline">
                <input type="hidden" name="id" value={h.id} />
                <input name="name" defaultValue={h.name} aria-label="Name" maxLength={120} />
              </ActionForm>
              <div className="row-actions" style={{ marginTop: 8 }}>
                <ActionForm action={updateHospitalAction} submit="−" buttonClass="small" className="vac">
                  <input type="hidden" name="id" value={h.id} />
                  <input type="hidden" name="delta" value="-1" />
                </ActionForm>
                <span className="num"><strong>{h.vacancies}</strong> seats{started && <span className="muted small"> · {taken.get(h.id) ?? 0} filled</span>}</span>
                <ActionForm action={updateHospitalAction} submit="+" buttonClass="small" className="vac">
                  <input type="hidden" name="id" value={h.id} />
                  <input type="hidden" name="delta" value="1" />
                </ActionForm>
                <ActionForm action={updateHospitalAction} submit="Set" buttonClass="small secondary" className="vac">
                  <input type="hidden" name="id" value={h.id} />
                  <input name="vacancies" type="number" min={0} max={999} defaultValue={h.vacancies} aria-label="Vacancies" />
                </ActionForm>
              </div>
              <div className="row-actions" style={{ marginTop: 8 }}>
                {i > 0 && (
                  <ActionForm action={moveHospitalAction} submit="↑" buttonClass="small secondary">
                    <input type="hidden" name="id" value={h.id} /><input type="hidden" name="dir" value="up" />
                  </ActionForm>
                )}
                {i < ctx.hospitals.length - 1 && (
                  <ActionForm action={moveHospitalAction} submit="↓" buttonClass="small secondary">
                    <input type="hidden" name="id" value={h.id} /><input type="hidden" name="dir" value="down" />
                  </ActionForm>
                )}
                {locked ? (
                  <span className="muted small">Has a manual placement: remove it to delete</span>
                ) : (
                  <ActionForm
                    action={deleteHospitalAction}
                    submit="Delete"
                    buttonClass="small danger"
                    confirmText={
                      affected.length
                        ? `Delete ${h.name}? These doctors have chosen it and will have to choose again:\n\n${affected.join("\n")}`
                        : `Delete ${h.name}?`
                    }
                  >
                    <input type="hidden" name="id" value={h.id} />
                  </ActionForm>
                )}
              </div>
              {affected.length > 0 && <p className="muted small" style={{ margin: "8px 0 0" }}>Chosen by {affected.length} doctor{affected.length === 1 ? "" : "s"} this round.</p>}
              <details style={{ marginTop: 10 }} open={cons.length > 0 && consSeats !== h.vacancies}>
                <summary className="small">
                  Consultants: {cons.length ? `${cons.length} (${consSeats} seat${consSeats === 1 ? "" : "s"})` : "none listed"}
                  {cons.length > 0 && consSeats !== h.vacancies && <span className="unalloc"> · does not match {h.vacancies} hospital seats</span>}
                </summary>
                {cons.map((c) => (
                  <div className="row-actions" key={c.id} style={{ marginTop: 6 }}>
                    <ActionForm action={updateConsultantAction} submit="Save" buttonClass="small secondary" className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <input name="name" defaultValue={c.name} aria-label="Consultant name" maxLength={120} />
                      <input name="seats" type="number" min={1} max={99} defaultValue={c.seats} aria-label="Seats" style={{ maxWidth: 70 }} />
                    </ActionForm>
                    <span className="muted small">preferred by {wantedBy(c.id)}</span>
                    <ActionForm action={deleteConsultantAction} submit="Remove" buttonClass="small danger" confirmText={`Remove ${c.name}? Doctors who preferred them will have "any consultant".`}>
                      <input type="hidden" name="id" value={c.id} />
                    </ActionForm>
                  </div>
                ))}
                <ActionForm action={addConsultantAction} submit="Add consultant" buttonClass="small" className="inline">
                  <input type="hidden" name="hospitalId" value={h.id} />
                  <input name="name" placeholder="Consultant name" aria-label="New consultant name" maxLength={120} required />
                  <input name="seats" type="number" min={1} max={99} defaultValue={1} aria-label="Seats" style={{ maxWidth: 70 }} />
                </ActionForm>
              </details>
            </div>
          );
        })}
      </section>
    </div>
  );
}
