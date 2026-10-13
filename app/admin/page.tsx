import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { ActionForm } from "@/components/ActionForm";
import { getCurrentRound, hasSubmitted, liveResults, loadRoundContext } from "@/lib/rounds";
import { LiveRefresh } from "@/components/LiveRefresh";
import { formatColombo } from "@/lib/time";
import { roundTransitionAction } from "./actions";

export const metadata: Metadata = { title: "Admin" };

const NEXT = {
  DRAFT: { step: "open", label: "Open the round for choices", text: "Doctors can see the hospitals but cannot choose yet." },
  OPEN: { step: "lock", label: "Lock the round", text: "Doctors are choosing. Lock when everyone has submitted or the deadline has passed." },
  LOCKED: { step: "publish", label: "Publish as final", text: "Choices are locked. Check the live allocation, then publish it as final." },
  ALLOCATED: { step: "publish", label: "Publish as final", text: "Choices are locked. Check the live allocation, then publish it as final." },
  PUBLISHED: null,
} as const;

export default async function AdminHome() {
  await requireAdmin();
  await connection();
  const round = await getCurrentRound();
  const ctx = await loadRoundContext(round);
  const active = ctx.candidates.filter((c) => c.active);
  const submitted = active.filter((c) => hasSubmitted(ctx, c.id)).length;
  const totalSeats = ctx.hospitals.reduce((n, h) => n + h.vacancies, 0);
  const next = NEXT[round.status];
  const unplaced =
    round.status === "DRAFT" ? 0 : liveResults(ctx).filter((r) => !r.hospital && r.reason !== "withdrawn").length;
  const audit = await prisma.auditLog.findMany({ orderBy: { at: "desc" }, take: 8 });

  return (
    <div>
      <LiveRefresh seconds={10} />
      <h1>Allocation <span className="badge">{round.status.toLowerCase()}</span></h1>
      {round.deadline && <p className="muted">Deadline: {formatColombo(round.deadline)}</p>}

      <div className="grid" style={{ margin: "14px 0" }}>
        <div className="card stat"><div className="v">{submitted}/{active.length}</div><div className="l">doctors submitted</div></div>
        <div className="card stat"><div className="v">{totalSeats}</div><div className="l">seats in total</div></div>
        <div className="card stat"><div className="v">{ctx.hospitals.length}</div><div className="l">hospitals</div></div>
      </div>

      {ctx.hospitals.length > 0 && totalSeats < active.length && (
        <div className="banner bad">
          There are fewer seats ({totalSeats}) than doctors ({active.length}). Some doctors will end up not allocated.
        </div>
      )}
      {ctx.hospitals.length === 0 && <div className="banner warn">No hospitals yet. <Link href="/admin/hospitals">Add the hospitals</Link> first.</div>}

      {next && (
        <section className="section">
          <h2>Next step</h2>
          <p>{next.text}</p>
          <ActionForm action={roundTransitionAction} submit={next.label} className="form">
            <input type="hidden" name="number" value={round.number} />
            <input type="hidden" name="step" value={next.step} />
          </ActionForm>
          {round.status === "LOCKED" && (
            <ActionForm action={roundTransitionAction} submit="Unlock (let doctors edit again)" buttonClass="secondary" className="form">
              <input type="hidden" name="number" value={round.number} />
              <input type="hidden" name="step" value="unlock" />
            </ActionForm>
          )}
          <p style={{ marginTop: 14 }}><Link href={`/admin/round/${round.number}`}>Open the results page</Link> for the live allocation, manual placements and export.</p>
        </section>
      )}

      {round.status === "PUBLISHED" && (
        <section className="section">
          <h2>Results are published</h2>
          <p>
            {unplaced > 0 ? `${unplaced} active doctor${unplaced === 1 ? " is" : "s are"} not allocated.` : "Everyone active has a hospital."}
          </p>
          <p><Link href={`/admin/round/${round.number}`}>View results, print or export</Link></p>
        </section>
      )}

      <section className="section">
        <h2>Recent activity</h2>
        <ul className="hospital-list small">
          {audit.map((a) => (
            <li key={a.id}><span>{a.actor} · {a.action}</span><span className="seats">{formatColombo(a.at)}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
