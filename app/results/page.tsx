import type { Metadata } from "next";
import { connection } from "next/server";
import { requireDoctor } from "@/lib/auth/session";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ResultsTable } from "@/components/ResultsTable";
import { choiceLabels, computeAllocation, getCurrentRound, hasSubmitted, liveResults, loadRoundContext, seatsTaken } from "@/lib/rounds";

export const metadata: Metadata = { title: "Results" };

const STATUS_LABEL = { DRAFT: "Not open yet", OPEN: "Open", LOCKED: "Locked", ALLOCATED: "Locked", PUBLISHED: "Final" } as const;
const BADGE = { DRAFT: "draft", OPEN: "open", LOCKED: "locked", ALLOCATED: "locked", PUBLISHED: "published" } as const;
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** Read-only twin of the admin results page: the same live allocation, with no controls. */
export default async function Results() {
  const { candidate } = await requireDoctor();
  await connection();

  const round = await getCurrentRound();
  const ctx = await loadRoundContext(round);
  const out = computeAllocation(ctx);
  const rows = liveResults(ctx, out);
  const taken = seatsTaken(rows);
  const final = round.status === "PUBLISHED";
  const started = round.status !== "DRAFT";

  const placed = rows.filter((r) => r.hospital);
  const notPlaced = rows.filter((r) => !r.hospital && r.reason !== "withdrawn");
  const byRank = [1, 2, 3].map((k) => placed.filter((r) => r.choiceRank === k).length);
  const manual = rows.filter((r) => r.manual).length;
  const submitted = ctx.candidates.filter((c) => c.active && hasSubmitted(ctx, c.id)).length;
  const active = ctx.candidates.filter((c) => c.active).length;
  const choiceNames = new Map([...ctx.choices.keys()].map((id) => [id, choiceLabels(ctx, id)]));
  const consultantTaken = new Map<string, number>();
  for (const r of rows) if (r.consultantId) consultantTaken.set(r.consultantId, (consultantTaken.get(r.consultantId) ?? 0) + 1);

  return (
    <div>
      <LiveRefresh seconds={10} />
      <h1>
        Results <span className={`badge ${BADGE[round.status]}`}>{STATUS_LABEL[round.status]}</span>
      </h1>
      <p className="muted small">
        {final ? "The final allocation." : <><span className="live-dot" />Live: updates every 10 s, last at {timeFmt.format(new Date())}. Not final until the admin publishes it.</>}
        {" "}Unofficial: this tool only helps the batch coordinate.
      </p>

      {!started ? (
        <div className="banner">Choices are not open yet. Results appear here once doctors start choosing.</div>
      ) : (
        <>
          <section className="section">
            <h2>Summary</h2>
            <div className="grid">
              <div className="card stat"><div className="v">{submitted}/{active}</div><div className="l">submitted</div></div>
              <div className="card stat"><div className="v">{placed.length}</div><div className="l">placed</div></div>
              <div className="card stat"><div className="v">{byRank[0]} / {byRank[1]} / {byRank[2]}</div><div className="l">1st / 2nd / 3rd choice</div></div>
              <div className="card stat"><div className="v">{notPlaced.length}</div><div className="l">not allocated</div></div>
              {manual > 0 && <div className="card stat"><div className="v">{manual}</div><div className="l">manual</div></div>}
            </div>
          </section>

          <section className="section">
            <h2>Doctors<small>{final ? "final" : "live: if it closed now"}</small></h2>
            <ResultsTable rows={rows} highlight={candidate.id} choices={choiceNames} />
          </section>

          <section className="section">
            <h2>Seats</h2>
            <ul className="hospital-list">
              {ctx.hospitals.map((h) => {
                const list = ctx.consultants.filter((c) => c.hospitalId === h.id);
                return (
                  <li key={h.id}>
                    <span>
                      {h.name}
                      {list.length > 0 && (
                        <span className="muted small consultants" style={{ display: "block" }}>
                          {list.map((c) => `${c.name}${c.seats > 1 ? ` ×${c.seats}` : ""}${(consultantTaken.get(c.id) ?? 0) >= c.seats ? " (taken)" : ""}`).join(" · ")}
                        </span>
                      )}
                    </span>
                    <span className="seats">{taken.get(h.id) ?? 0} of {h.vacancies} filled</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="section">
            <h2>Step by step</h2>
            <details>
              <summary>Show how each doctor was processed</summary>
              <pre className="trace">{out.trace.join("\n")}</pre>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
