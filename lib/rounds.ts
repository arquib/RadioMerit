import "server-only";
import { prisma } from "@/lib/prisma";
import { allocate, assignConsultants, type AllocateOutput } from "@/lib/allocate";
import { requiredChoices } from "@/lib/choices";
import type { ResultRow } from "@/lib/results";
import type { Round } from "@/app/generated/prisma/client";

// There is one round and nothing about the allocation is stored: it is always computed from the current
// hospitals, seats, choices and manual placements, so every change shows up everywhere on the next refresh.

export async function getCurrentRound(): Promise<Round> {
  const latest = await prisma.round.findFirst({ orderBy: { number: "desc" } });
  return latest ?? prisma.round.create({ data: { number: 1 } });
}

/** Doctors can edit while the round is OPEN and the deadline (if any) has not passed. */
export const isEditable = (r: Pick<Round, "status" | "deadline">, now = new Date()) =>
  r.status === "OPEN" && (!r.deadline || r.deadline > now);

/** Hospitals, doctors, choices and manual placements of the round. */
export async function loadRoundContext(round: Round) {
  const [hospitals, consultants, candidates, rows, overrides] = await Promise.all([
    prisma.hospital.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.consultant.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.candidate.findMany({ orderBy: { order: "asc" } }),
    prisma.choice.findMany({ where: { roundId: round.id }, orderBy: { rank: "asc" } }),
    prisma.allocation.findMany({ where: { roundId: round.id, overridden: true } }),
  ]);

  const choices = new Map<string, string[]>();
  // Preferred consultant per ranked hospital, aligned with `choices` (null = any).
  const choiceConsultants = new Map<string, (string | null)[]>();
  const preferences = new Map<string, Map<string, string | null>>();
  for (const c of rows) {
    choices.set(c.candidateId, [...(choices.get(c.candidateId) ?? []), c.hospitalId]);
    choiceConsultants.set(c.candidateId, [...(choiceConsultants.get(c.candidateId) ?? []), c.consultantId]);
    if (!preferences.has(c.candidateId)) preferences.set(c.candidateId, new Map());
    preferences.get(c.candidateId)!.set(c.hospitalId, c.consultantId);
  }
  const hospitalOrder = new Map(hospitals.map((h, i) => [h.id, i]));
  consultants.sort((a, b) => (hospitalOrder.get(a.hospitalId) ?? 0) - (hospitalOrder.get(b.hospitalId) ?? 0) || a.sortOrder - b.sortOrder);

  return {
    round,
    hospitals,
    candidates,
    capacity: new Map(hospitals.map((h) => [h.id, h.vacancies])),
    hospitalIds: new Set(hospitals.map((h) => h.id)),
    // Hospitals with 0 seats can still be ranked: seats may be added later.
    required: requiredChoices(hospitals.length),
    requiredFor: (meritOrder: number) => requiredChoices(hospitals.length, meritOrder),
    choices,
    choiceConsultants,
    preferences,
    consultants,
    consultantNames: new Map(consultants.map((c) => [c.id, c.name])),
    fixed: new Map(overrides.map((a) => [a.candidateId, a.hospitalId])),
    overrides,
    hospitalNames: new Map(hospitals.map((h) => [h.id, h.name])),
  };
}
export type RoundContext = Awaited<ReturnType<typeof loadRoundContext>>;

/** The allocation the current data produces (manual placements are fixed first, everyone else by merit). */
export function computeAllocation(ctx: RoundContext): AllocateOutput {
  return allocate({
    candidates: ctx.candidates.map((c) => ({ id: c.id, order: c.order, active: c.active })),
    choices: ctx.choices,
    capacity: ctx.capacity,
    fixed: ctx.fixed,
    hospitalNames: ctx.hospitalNames,
  });
}

/** The allocation as one row per doctor, in merit order: hospital first, then the consultant inside it. */
export function liveResults(ctx: RoundContext, out: AllocateOutput = computeAllocation(ctx)): ResultRow[] {
  const byId = new Map(out.allocations.map((a) => [a.candidateId, a]));
  const hospitalOf = (id: string) => (ctx.fixed.has(id) ? ctx.fixed.get(id) : byId.get(id)?.hospitalId) ?? null;
  const consultantOf = assignConsultants({
    placed: ctx.candidates.flatMap((c) => {
      const h = hospitalOf(c.id);
      return h ? [{ candidateId: c.id, order: c.order, hospitalId: h }] : [];
    }),
    preferences: ctx.preferences,
    consultants: ctx.consultants,
  });
  const notes = new Map(ctx.overrides.map((a) => [a.candidateId, a.overrideNote]));
  const name = (id: string | null) => (id ? ctx.hospitalNames.get(id) ?? "?" : null);
  return ctx.candidates.map((c) => {
    const manual = ctx.fixed.has(c.id);
    const a = byId.get(c.id);
    const hospitalId = hospitalOf(c.id);
    const cons = consultantOf.get(c.id) ?? { consultantId: null, how: "none" as const };
    return {
      candidateId: c.id,
      order: c.order,
      name: c.name,
      indexNo: c.indexNo,
      hospitalId,
      hospital: name(hospitalId),
      consultantId: cons.consultantId,
      consultant: cons.consultantId ? ctx.consultantNames.get(cons.consultantId) ?? "?" : null,
      consultantHow: cons.how,
      choiceRank: manual ? null : a?.choiceRank ?? null,
      reason: manual ? "manual" : a?.reason ?? "no_choices",
      manual,
      note: manual ? notes.get(c.id) ?? null : null,
    };
  });
}

/** A doctor's ranked choices as "Hospital (consultant)"; the consultant is shown only where the hospital lists consultants. */
export function choiceLabels(ctx: RoundContext, candidateId: string): string[] {
  return (ctx.choices.get(candidateId) ?? []).map((h, i) => {
    const name = ctx.hospitalNames.get(h) ?? "?";
    if (!ctx.consultants.some((c) => c.hospitalId === h)) return name;
    const cid = ctx.choiceConsultants.get(candidateId)?.[i];
    return `${name} (${cid ? ctx.consultantNames.get(cid) ?? "?" : "any consultant"})`;
  });
}

/** Seats taken per hospital id in a set of result rows. */
export function seatsTaken(rows: ResultRow[]) {
  const taken = new Map<string, number>();
  for (const r of rows) if (r.hospitalId) taken.set(r.hospitalId, (taken.get(r.hospitalId) ?? 0) + 1);
  return taken;
}

/** Submitted = ranked as many hospitals as this doctor needs to (1 for #1, 2 for #2, else 3). */
export function hasSubmitted(ctx: RoundContext, candidateId: string) {
  const c = ctx.candidates.find((x) => x.id === candidateId);
  const need = c ? ctx.requiredFor(c.order) : 0;
  return need > 0 && (ctx.choices.get(candidateId)?.length ?? 0) >= need;
}
