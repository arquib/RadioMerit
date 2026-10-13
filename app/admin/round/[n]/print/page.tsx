import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { PrintButton } from "@/components/PrintButton";
import { ResultsTable } from "@/components/ResultsTable";
import { liveResults, loadRoundContext, seatsTaken } from "@/lib/rounds";
import { formatColombo } from "@/lib/time";

export default async function Print({ params }: PageProps<"/admin/round/[n]/print">) {
  await requireAdmin();
  await connection();
  const n = Number((await params).n);
  const round = await prisma.round.findUnique({ where: { number: n } });
  if (!round) notFound();
  const ctx = await loadRoundContext(round);
  const rows = liveResults(ctx);
  const taken = seatsTaken(rows);
  return (
    <div>
      <PrintButton />
      <h1>MD Radiology hospital allocation</h1>
      <p className="muted">Unofficial, batch coordination · {round.status.toLowerCase()} · printed {formatColombo(new Date())}</p>
      <ResultsTable rows={rows} detail />
      <h2 style={{ marginTop: 20 }}>Seats</h2>
      <ul className="hospital-list">
        {ctx.hospitals.map((h) => <li key={h.id}><span>{h.name}</span><span className="seats">{taken.get(h.id) ?? 0} of {h.vacancies} filled</span></li>)}
      </ul>
    </div>
  );
}
