import type { Metadata } from "next";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { CopyButton } from "@/components/CopyButton";
import { getCurrentRound, hasSubmitted, loadRoundContext } from "@/lib/rounds";
import { formatColombo } from "@/lib/time";

export const metadata: Metadata = { title: "Submissions" };

export default async function Submissions() {
  await requireAdmin();
  await connection();
  const round = await getCurrentRound();
  const ctx = await loadRoundContext(round);
  const active = ctx.candidates.filter((c) => c.active);
  const missing = active.filter((c) => !hasSubmitted(ctx, c.id));
  const nameOf = (id: string) => ctx.hospitalNames.get(id) ?? "?";
  const url = process.env.PUBLIC_URL; // optional: the address doctors should open
  const reminder =
    `Radiology hospital choices: ${missing.length} still missing.\n` +
    missing.map((c) => `• #${c.order} ${c.name}`).join("\n") +
    (url ? `\n\nPlease choose here: ${url}` : "") +
    (round.deadline ? `\nDeadline: ${formatColombo(round.deadline)}` : "");

  return (
    <div>
      <h1>Submissions</h1>
      <p>
        <strong>{active.length - missing.length}</strong> of <strong>{active.length}</strong> have submitted
        {ctx.required > 0 ? <> (#1 ranks 1 hospital, #2 ranks 2, everyone else {ctx.required})</> : null}.
      </p>
      {missing.length > 0 && <CopyButton text={reminder} label="Copy WhatsApp reminder" />}

      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>#</th><th>Doctor</th><th>1st</th><th>2nd</th><th>3rd</th></tr></thead>
          <tbody>
            {ctx.candidates.map((c) => {
              const ch = ctx.choices.get(c.id) ?? [];
              return (
                <tr key={c.id} className={c.active ? undefined : "off"}>
                  <td className="num">{c.order}</td>
                  <td>{c.name}</td>
                  {ch.length ? [0, 1, 2].map((i) => <td key={i}>{ch[i] ? nameOf(ch[i]) : ""}</td>) : <td colSpan={3} className="muted">{c.active ? "not submitted" : "withdrawn"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
