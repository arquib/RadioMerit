import { connection } from "next/server";
import Link from "next/link";
import { requireDoctor } from "@/lib/auth/session";
import { choiceLabels, getCurrentRound, isEditable, liveResults, loadRoundContext, seatsTaken } from "@/lib/rounds";
import { consultantHowLabel, hospitalLabel, reasonLabel } from "@/lib/results";
import { formatColombo } from "@/lib/time";
import { ResultsTable } from "@/components/ResultsTable";
import { LiveRefresh } from "@/components/LiveRefresh";
import { switchName } from "./me/actions";
import { ChoiceForm } from "./choice-form";

const RANK = ["", "1st", "2nd", "3rd"];
const STATUS_LABEL = { DRAFT: "Not open yet", OPEN: "Open", LOCKED: "Locked", ALLOCATED: "Locked", PUBLISHED: "Final" } as const;
const BADGE = { DRAFT: "draft", OPEN: "open", LOCKED: "locked", ALLOCATED: "locked", PUBLISHED: "published" } as const;
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export default async function Home() {
  const { candidate } = await requireDoctor();
  await connection();

  const round = await getCurrentRound();
  const ctx = await loadRoundContext(round);
  const final = round.status === "PUBLISHED";
  const started = round.status !== "DRAFT";
  // Always live: seat, hospital and choice changes show up on the next refresh, before and after publishing.
  const rows = liveResults(ctx);
  const taken = seatsTaken(rows);
  const me = rows.find((r) => r.candidateId === candidate.id);

  const editable = isEditable(round);
  const need = ctx.requiredFor(candidate.order);
  const mine = ctx.choices.get(candidate.id) ?? [];
  const choiceNames = new Map([...ctx.choices.keys()].map((id) => [id, choiceLabels(ctx, id)]));
  const consultantsAt = (h: string) => ctx.consultants.filter((c) => c.hospitalId === h);
  const consultantTaken = new Map<string, number>();
  for (const r of rows) if (r.consultantId) consultantTaken.set(r.consultantId, (consultantTaken.get(r.consultantId) ?? 0) + 1);

  return (
    <div>
      <LiveRefresh seconds={10} />
      <div className="inline" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>#{candidate.order} {candidate.name}</h1>
          <p className="muted small">{candidate.indexNo} <span className={`badge ${BADGE[round.status]}`}>{STATUS_LABEL[round.status]}</span></p>
        </div>
        <form action={switchName}><button type="submit" className="secondary small">Not you? Switch</button></form>
      </div>

      {/* My (live or final) result */}
      {started && candidate.active && me && (final || mine.length > 0) && (
        <div className={`result-card${me.hospital ? "" : " unalloc-card"}`}>
          <div className="muted small">{final ? "Your hospital (final)" : "If it closed now, you would get"}</div>
          <div className="big">{hospitalLabel(me)}</div>
          {me.consultant && <div><strong>{me.consultant}</strong> <span className="muted small">({consultantHowLabel(me.consultantHow)})</span></div>}
          {me.consultantHow === "unassigned" && <div className="muted small">Consultant to be arranged</div>}
          <div className="muted">
            {me.manual
              ? "Placed manually by the admin"
              : me.choiceRank
                ? `Your ${RANK[me.choiceRank]} choice`
                : me.reason === "all_choices_full"
                  ? "All of your choices are filled by doctors higher on the merit list."
                  : reasonLabel(me.reason)}
          </div>
          {!final && <div className="muted small" style={{ marginTop: 6 }}>Live: this changes as choices and seats change.</div>}
        </div>
      )}

      {round.deadline && round.status === "OPEN" && (
        <div className={`banner ${round.deadline > new Date() ? "" : "warn"}`}>
          {round.deadline > new Date() ? "Choose by" : "The deadline passed on"} <strong>{formatColombo(round.deadline)}</strong>.
        </div>
      )}

      {!candidate.active && <div className="banner warn">You are marked as withdrawn from this allocation.</div>}

      {/* Choosing */}
      {candidate.active && !final && (
        <section className="section">
          <h2>Your choices</h2>
          {round.status === "DRAFT" && <p className="muted">Choices are not open yet. The hospitals and seats below may still change.</p>}
          {started && ctx.required === 0 && <p className="muted">No hospitals have been added yet.</p>}
          {editable && mine.length > 0 && mine.length < need && (
            <div className="banner warn">A hospital you chose was removed. Please choose your {need === 1 ? "hospital" : `${need} hospitals`} again.</div>
          )}
          {editable && need > 0 && (
            <>
              <p className="muted small">
                {candidate.order === 1
                  ? "As #1 on the merit list you always get your first choice, so you choose just one hospital."
                  : candidate.order === 2 && need === 2
                    ? "As #2 only #1 can take a seat before you, so you rank two hospitals."
                    : `Rank ${need} hospital${need === 1 ? "" : "s"} in order of preference.`}{" "}
                You can change {need === 1 ? "it" : "them"} until the admin locks the choices.
              </p>
              <ChoiceForm
                hospitals={ctx.hospitals.map((h) => ({ id: h.id, name: h.name, vacancies: h.vacancies, consultants: consultantsAt(h.id).map((c) => ({ id: c.id, name: c.name, seats: c.seats })) }))}
                required={need}
                initial={mine}
                initialConsultants={ctx.choiceConsultants.get(candidate.id) ?? []}
              />
              <details className="small" style={{ marginTop: 12 }}>
                <summary>How the allocation works</summary>
                <p>
                  Doctors are processed in merit order, #1 first. Each doctor gets the first hospital on their list that still has a seat.
                  Nobody below you can take a seat before you, so ranking the hospitals you really prefer, in that order, is always your best move.
                  If all three of your hospitals are filled by doctors above you, you are not allocated; there is no second round.
                  Consultants are decided after hospitals: naming one never costs you a hospital. Inside your hospital, doctors who
                  named a consultant get them in merit order; everyone else (&ldquo;any&rdquo;, or whose consultant was taken) gets one of the remaining consultants.
                </p>
              </details>
            </>
          )}
          {!editable && round.status === "OPEN" && <p className="muted">The deadline has passed, so choices can no longer be changed.</p>}
          {(round.status === "LOCKED" || round.status === "ALLOCATED") && <div className="banner">Choices are locked. The admin will publish the final result.</div>}
          {!editable && started && (
            <p>{mine.length > 0 ? <>Yours: {choiceLabels(ctx, candidate.id).map((t, i) => `${RANK[i + 1]} ${t}`).join(" · ")}.</> : <>You did not submit any choices.</>}</p>
          )}
        </section>
      )}

      {/* Hospitals with live (or final) seat use */}
      <section className="section">
        <h2>Hospitals<small>{started ? (final ? "seats filled" : "seats filled right now") : "seats"}</small></h2>
        {ctx.hospitals.length === 0 ? (
          <p className="muted">No hospitals have been added yet.</p>
        ) : (
          <ul className="hospital-list">
            {ctx.hospitals.map((h) => (
              <li key={h.id}>
                <span>
                  {h.name}
                  {consultantsAt(h.id).length > 0 && (
                    <span className="muted small consultants" style={{ display: "block" }}>
                      {consultantsAt(h.id).map((c) => `${c.name}${c.seats > 1 ? ` ×${c.seats}` : ""}${started && (consultantTaken.get(c.id) ?? 0) >= c.seats ? " (taken)" : ""}`).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="seats">{started ? `${taken.get(h.id) ?? 0} of ${h.vacancies} filled` : `${h.vacancies} seat${h.vacancies === 1 ? "" : "s"}`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Everyone: choices + allocation */}
      {started && (
        <section className="section">
          <h2>{final ? "Final allocation" : <><span className="live-dot" />Live allocation</>}<small>{final ? `unofficial · ${timeFmt.format(new Date())}` : `updates every 10 s · ${timeFmt.format(new Date())}`}</small></h2>
          {!final && <p className="muted small">Everyone&rsquo;s choices and who would get which hospital if it closed now. Not final until the admin publishes it.</p>}
          <ResultsTable rows={rows} highlight={candidate.id} choices={choiceNames} />
        </section>
      )}

      <p className="muted small" style={{ marginTop: 32 }}>
        Unofficial: this tool only helps the batch coordinate. <Link href="/me">Switch name</Link>
      </p>
    </div>
  );
}
