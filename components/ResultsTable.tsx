import { consultantHowLabel, hospitalLabel, reasonLabel, type ResultRow } from "@/lib/results";

const RANK = ["", "1st", "2nd", "3rd"];

/** `choices` (candidateId -> hospital names in rank order) adds each doctor's 1st/2nd/3rd under their name. */
export function ResultsTable({ rows, highlight, detail = false, choices }: { rows: ResultRow[]; highlight?: string; detail?: boolean; choices?: Map<string, string[]> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>#</th><th>Doctor</th><th>Hospital</th><th>Choice</th>{detail && <th>Note</th>}</tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const picks = choices?.get(r.candidateId);
            return (
              <tr key={r.candidateId} className={r.candidateId === highlight ? "me" : r.reason === "withdrawn" ? "off" : undefined}>
                <td className="num">{r.order}</td>
                <td>
                  {r.name}
                  {choices && (
                    <div className="muted small picks">
                      {picks?.length ? picks.map((h, i) => `${i + 1}. ${h}`).join(" · ") : r.reason === "withdrawn" ? "" : "not submitted yet"}
                    </div>
                  )}
                </td>
                <td>
                  {r.hospital ?? <span className={r.reason === "withdrawn" ? "muted" : "unalloc"}>{hospitalLabel(r)}</span>}
                  {r.consultant && <div className="small">{r.consultant} <span className="muted">({consultantHowLabel(r.consultantHow)})</span></div>}
                  {r.consultantHow === "unassigned" && <div className="muted small">consultant to be arranged</div>}
                </td>
                <td>{r.manual ? <span className="badge">manual</span> : r.choiceRank ? RANK[r.choiceRank] : <span className="muted small">{r.reason === "withdrawn" ? "" : reasonLabel(r.reason)}</span>}</td>
                {detail && <td className="muted small">{r.note ?? ""}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
