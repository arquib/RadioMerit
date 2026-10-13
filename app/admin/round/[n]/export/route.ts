import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { consultantHowLabel, hospitalLabel, reasonLabel } from "@/lib/results";
import { liveResults, loadRoundContext } from "@/lib/rounds";

const cell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(_req: Request, ctx: RouteContext<"/admin/round/[n]/export">) {
  await requireAdmin();
  const n = Number((await ctx.params).n);
  const round = await prisma.round.findUnique({ where: { number: n } });
  if (!round) notFound();
  const rows = liveResults(await loadRoundContext(round));
  const lines = [
    ["Merit order", "Index no", "Name", "Hospital", "Choice", "Consultant", "Consultant basis", "Note"].map(cell).join(","),
    ...rows.map((r) =>
      [r.order, r.indexNo, r.name, hospitalLabel(r), r.manual ? "manual" : r.choiceRank, r.consultant, consultantHowLabel(r.consultantHow), r.note ?? (r.hospital ? "" : reasonLabel(r.reason))].map(cell).join(","),
    ),
  ];
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="radiology-allocation.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
