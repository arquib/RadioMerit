"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { doctorOrNull } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { choiceSchema } from "@/lib/choices";
import { fail, ok, type Result } from "@/lib/result";
import { getCurrentRound, isEditable, loadRoundContext } from "@/lib/rounds";

/** A doctor saves their own ranked choices. The candidate always comes from the session, never from the form. */
export async function saveChoicesAction(_prev: Result | null, fd: FormData): Promise<Result> {
  const me = await doctorOrNull();
  if (!me) return fail("Your session has expired. Reload the page and pick your name again.");
  if (!me.active) return fail("You are marked as withdrawn, so you cannot choose.");

  const round = await getCurrentRound();
  if (!isEditable(round)) return fail("Choices are closed for this round.");
  const ctx = await loadRoundContext(round);

  const parsed = choiceSchema(ctx.requiredFor(me.order), ctx.hospitalIds).safeParse(fd.getAll("choice").map(String));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const ids = parsed.data;
  // Optional preferred consultant per rank ("" = any); it must work at the hospital chosen for that rank.
  const wanted = fd.getAll("consultant").map(String);
  const consultantIds = ids.map((h, i) => wanted[i] || null);
  for (const [i, c] of consultantIds.entries()) {
    if (c && !ctx.consultants.some((x) => x.id === c && x.hospitalId === ids[i])) return fail("One of the consultants does not work at the hospital chosen for that rank. Reload the page.");
  }

  await prisma.$transaction([
    prisma.choice.deleteMany({ where: { roundId: round.id, candidateId: me.id } }),
    prisma.choice.createMany({
      data: ids.map((hospitalId, i) => ({ roundId: round.id, candidateId: me.id, rank: i + 1, hospitalId, consultantId: consultantIds[i] })),
    }),
  ]);
  await audit(`doctor:${me.order}`, "choices.save", { round: round.number, hospitalIds: ids, consultantIds });
  revalidatePath("/", "layout");
  return ok("Saved. You can change your choices until the round is locked.");
}
