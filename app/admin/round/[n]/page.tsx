import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { ActionForm } from "@/components/ActionForm";
import { LiveRefresh } from "@/components/LiveRefresh";
import { computeAllocation, liveResults, loadRoundContext, seatsTaken } from "@/lib/rounds";
import { consultantHowLabel, hospitalLabel, reasonLabel } from "@/lib/results";
import { clearOverrideAction, overrideAction, roundTransitionAction } from "../../actions";

export const metadata: Metadata = { title: "Results" };
const RANK = ["", "1st", "2nd", "3rd"];

function Step({ n, step, label, secondary, confirmText }: { n: number; step: string; label: string; secondary?: boolean; confirmText?: string }) {
  return (
    <ActionForm action={roundTransitionAction} submit={label} buttonClass={secondary ? "small secondary" : "small"} confirmText={confirmText}>
      <input type="hidden" name="number" value={n} />
      <input type="hidden" name="step" value={step} />
    </ActionForm>
  );
}

export default async function RoundPage({ params }: PageProps<"/admin/round/[n]">) {
  await requireAdmin();
  await connection();
  const n = Number((await params).n);
  const round = await prisma.round.findUnique({ where: { number: n } });
  if (!round) notFound();
  const ctx = await loadRoundContext(round);
  const out = computeAllocation(ctx);
  const rows = liveResults(ctx, out);
  const taken = seatsTaken(rows);
  const nameOf = (id: string) => ctx.hospitalNames.get(id) ?? "?";

  const started = round.status !== "DRAFT";
  const locked = round.status === "LOCKED" || round.status === "ALLOCATED";
  const placed = rows.filter((r) => r.hospital);
  const notPlaced = rows.filter((r) => !r.hospital && r.reason !== "withdrawn");
  const byRank = [1, 2, 3].map((k) => placed.filter((r) => r.choiceRank === k).length);
  const manual = rows.filter((r) => r.manual).length;
  const canOverride = round.status !== "DRAFT" && round.status !== "OPEN";

  return (
    <div>
      <LiveRefresh seconds={10} />
      <h1>Results <span className="badge">{locked ? "locked" : round.status.toLowerCase()}</span></h1>
      <p className="muted small">Live: always computed from the current choices, seats and manual placements{round.status === "PUBLISHED" ? " (doctors see it as final)" : ""}.</p>

      <section className="section">
        <h2>Actions</h2>
        <div className="row-actions">
          {round.status === "DRAFT" && <Step n={n} step="open" label="Open for choices" />}
          {round.status === "OPEN" && <Step n={n} step="lock" label="Lock" />}
          {locked && <Step n={n} step="unlock" label="Unlock" secondary />}
          {locked && <Step n={n} step="publish" label="Publish as final" confirmText="Publish? Doctors will see the allocation marked as final." />}
          {round.status === "PUBLISHED" && <Step n={n} step="unpublish" label="Unpublish" secondary confirmText="Mark the allocation as not final again?" />}
        </div>
      </section>

      {started && (
        <section className="section">
          <h2>Summary</h2>
          <div className="grid">
            <div className="card stat"><div className="v">{placed.length}</div><div className="l">placed</div></div>
            <div className="card stat"><div className="v">{byRank[0]} / {byRank[1]} / {byRank[2]}</div><div className="l">1st / 2nd / 3rd choice</div></div>
            <div className="card stat"><div className="v">{notPlaced.length}</div><div className="l">not allocated</div></div>
            {manual > 0 && <div className="card stat"><div className="v">{manual}</div><div className="l">manual</div></div>}
          </div>
        </section>
      )}

      <section className="section">
        <h2>Doctors<small>{started ? "live allocation" : "choices not open yet"}</small></h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Doctor</th><th>Hospital</th><th>Choice</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const c = ctx.candidates.find((x) => x.id === r.candidateId)!;
                const ch = ctx.choices.get(c.id) ?? [];
                const chc = ctx.choiceConsultants.get(c.id) ?? [];
                return (
                  <tr key={c.id} className={c.active ? undefined : "off"}>
                    <td className="num">{c.order}</td>
                    <td>
                      {c.name}
                      {ch.length > 0 && <div className="muted small">{ch.map((id, i) => `${i + 1}. ${nameOf(id)}${chc[i] ? ` (${ctx.consultantNames.get(chc[i]!) ?? "?"})` : ""}`).join(" · ")}</div>}
                      {r.note && <div className="muted small">Note: {r.note}</div>}
                    </td>
                    <td>{!started ? <span className="muted">—</span> : r.hospital ?? <span className={r.reason === "withdrawn" ? "muted" : "unalloc"}>{hospitalLabel(r)}</span>}
                      {started && r.consultant && <div className="small">{r.consultant} <span className="muted">({consultantHowLabel(r.consultantHow)})</span></div>}
                      {started && r.consultantHow === "unassigned" && <div className="muted small">consultant to be arranged</div>}
                    </td>
                    <td>{!started ? "" : r.manual ? <span className="badge">manual</span> : r.choiceRank ? RANK[r.choiceRank] : <span className="muted small">{reasonLabel(r.reason)}</span>}</td>
                    <td>
                      {canOverride && c.active && (
                        <details>
                          <summary className="small">{r.manual ? "Edit" : "Place"}</summary>
                          <ActionForm action={overrideAction} submit="Save manual placement" buttonClass="small">
                            <input type="hidden" name="number" value={n} />
                            <input type="hidden" name="candidateId" value={c.id} />
                            <select name="hospitalId" defaultValue={r.manual ? r.hospitalId ?? "" : ""} aria-label="Hospital">
                              <option value="">— leave unplaced —</option>
                              {ctx.hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                            </select>
                            <input name="note" placeholder="Reason (required)" defaultValue={r.note ?? ""} required />
                          </ActionForm>
                          {r.manual && (
                            <ActionForm action={clearOverrideAction} submit="Remove manual placement" buttonClass="small secondary">
                              <input type="hidden" name="number" value={n} />
                              <input type="hidden" name="candidateId" value={c.id} />
                            </ActionForm>
                          )}
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Seats</h2>
        <ul className="hospital-list">
          {ctx.hospitals.map((h) => <li key={h.id}><span>{h.name}</span><span className="seats">{taken.get(h.id) ?? 0} of {h.vacancies} filled</span></li>)}
        </ul>
        <p className="small"><Link href="/admin/hospitals">Change hospitals or seats</Link></p>
      </section>

      {started && (
        <section className="section">
          <h2>Step by step</h2>
          <details>
            <summary>Show how each doctor was processed</summary>
            <pre className="trace">{out.trace.join("\n")}</pre>
          </details>
        </section>
      )}

      {started && (
        <section className="section">
          <h2>Export</h2>
          <p className="row-actions">
            <a href={`/admin/round/${n}/export`}>Download CSV</a>
            <span className="muted">·</span>
            <Link href={`/admin/round/${n}/print`}>Print-friendly page</Link>
          </p>
        </section>
      )}
    </div>
  );
}
