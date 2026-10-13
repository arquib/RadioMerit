"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { fail, ok, type Result } from "@/lib/result";
import { getCurrentRound, loadRoundContext } from "@/lib/rounds";
import { fromColomboInput } from "@/lib/time";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const refresh = () => revalidatePath("/", "layout");

async function guard(fn: () => Promise<Result>): Promise<Result> {
  await requireAdmin();
  try {
    const r = await fn();
    if (r.ok) refresh();
    return r;
  } catch (e) {
    const msg = (e as { code?: string; message: string }).code === "P2002" ? "That value already exists." : (e as Error).message;
    return fail(msg);
  }
}

/* ───────────── Hospitals ───────────── */

export async function addHospitalAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    const name = str(fd, "name");
    const vacancies = Number(str(fd, "vacancies"));
    if (!name) return fail("Enter a hospital name.");
    if (!Number.isInteger(vacancies) || vacancies < 0 || vacancies > 999) return fail("Vacancies must be a whole number, 0 or more.");
    const last = await prisma.hospital.aggregate({ _max: { sortOrder: true } });
    await prisma.hospital.create({ data: { name, vacancies, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
    await audit("admin", "hospital.add", { name, vacancies });
    return ok(`Added ${name}.`);
  });
}

export async function updateHospitalAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    const id = str(fd, "id");
    const h = await prisma.hospital.findUnique({ where: { id } });
    if (!h) return fail("Hospital not found.");
    const data: { name?: string; vacancies?: number } = {};
    if (fd.has("name")) {
      const name = str(fd, "name");
      if (!name) return fail("The name cannot be empty.");
      data.name = name;
    }
    if (fd.has("vacancies") || fd.has("delta")) {
      const v = fd.has("delta") ? h.vacancies + Number(str(fd, "delta")) : Number(str(fd, "vacancies"));
      if (!Number.isInteger(v) || v < 0 || v > 999) return fail("Vacancies must be a whole number, 0 or more.");
      data.vacancies = v;
    }
    await prisma.hospital.update({ where: { id }, data });
    await audit("admin", "hospital.update", { id, ...data });
    return ok("Saved.");
  });
}

export async function moveHospitalAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    const list = await prisma.hospital.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const i = list.findIndex((h) => h.id === str(fd, "id"));
    const j = i + (str(fd, "dir") === "up" ? -1 : 1);
    if (i < 0 || j < 0 || j >= list.length) return ok("");
    [list[i], list[j]] = [list[j], list[i]];
    await prisma.$transaction(list.map((h, idx) => prisma.hospital.update({ where: { id: h.id }, data: { sortOrder: idx + 1 } })));
    return ok("Moved.");
  });
}

export async function deleteHospitalAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    const h = await prisma.hospital.findUnique({ where: { id: str(fd, "id") } });
    if (!h) return fail("Hospital not found.");
    if ((await prisma.allocation.count({ where: { hospitalId: h.id } })) > 0) {
      return fail("A doctor is placed here manually. Remove that manual placement first.");
    }
    const affected = await prisma.choice.findMany({ where: { hospitalId: h.id }, include: { candidate: true } });
    await prisma.hospital.delete({ where: { id: h.id } }); // cascades to the choices naming it
    await audit("admin", "hospital.delete", { name: h.name, choicesRemovedFor: [...new Set(affected.map((c) => c.candidate.order))] });
    return ok(`Deleted ${h.name}.`);
  });
}

/* ───────────── Consultants ───────────── */

const seatsOf = (fd: FormData) => {
  const n = Number(str(fd, "seats") || "1");
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
};

export async function addConsultantAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    const hospitalId = str(fd, "hospitalId");
    const name = str(fd, "name");
    const seats = seatsOf(fd);
    if (!name) return fail("Enter the consultant's name.");
    if (!seats) return fail("Seats must be a whole number, 1 or more.");
    const last = await prisma.consultant.aggregate({ where: { hospitalId }, _max: { sortOrder: true } });
    await prisma.consultant.create({ data: { hospitalId, name, seats, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
    await audit("admin", "consultant.add", { hospitalId, name, seats });
    return ok(`Added ${name}.`);
  });
}

export async function updateConsultantAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    const id = str(fd, "id");
    const name = str(fd, "name");
    const seats = seatsOf(fd);
    if (!name) return fail("The name cannot be empty.");
    if (!seats) return fail("Seats must be a whole number, 1 or more.");
    await prisma.consultant.update({ where: { id }, data: { name, seats } });
    await audit("admin", "consultant.update", { id, name, seats });
    return ok("Saved.");
  });
}

export async function deleteConsultantAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    const c = await prisma.consultant.delete({ where: { id: str(fd, "id") } }); // choices naming them become "any"
    await audit("admin", "consultant.delete", { name: c.name, hospitalId: c.hospitalId });
    return ok(`Removed ${c.name}. Doctors who preferred them now have "any".`);
  });
}

/* ───────────── Doctors ───────────── */

export async function updateDoctorAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    const id = str(fd, "id");
    const data: { name?: string; indexNo?: string; active?: boolean } = {};
    if (fd.has("name")) {
      if (!str(fd, "name")) return fail("The name cannot be empty.");
      data.name = str(fd, "name");
    }
    if (fd.has("indexNo")) data.indexNo = str(fd, "indexNo");
    if (fd.has("active")) data.active = str(fd, "active") === "true";
    await prisma.candidate.update({ where: { id }, data });
    await audit("admin", "doctor.update", { id, ...data });
    return ok("Saved.");
  });
}

export async function addDoctorAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    const order = Number(str(fd, "order"));
    const name = str(fd, "name");
    const indexNo = str(fd, "indexNo");
    if (!Number.isInteger(order) || order < 1) return fail("Merit position must be a whole number, 1 or more.");
    if (!name || !indexNo) return fail("Enter the name and the index number.");
    await prisma.candidate.create({ data: { order, name, indexNo } });
    await audit("admin", "doctor.add", { order, name });
    return ok(`Added #${order} ${name}.`);
  });
}

export async function removeDoctorAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    const c = await prisma.candidate.delete({ where: { id: str(fd, "id") } }); // cascades to choices and allocations
    await audit("admin", "doctor.remove", { order: c.order, name: c.name });
    return ok(`Removed #${c.order} ${c.name}.`);
  });
}

/* ───────────── Rounds ───────────── */

async function latestRound(n: number) {
  const round = await prisma.round.findUnique({ where: { number: n } });
  if (!round) throw new Error("Round not found.");
  return round;
}

/** Open → Lock → Publish (the allocation itself is always live, so there is nothing to run). */
export async function roundTransitionAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    const round = await latestRound(Number(str(fd, "number")));
    const step = str(fd, "step");
    const now = new Date();
    switch (step) {
      case "open": {
        if (round.status !== "DRAFT") return fail("Choices are already open.");
        const ctx = await loadRoundContext(round);
        if (ctx.required === 0) return fail("Add at least one hospital before opening.");
        await prisma.round.update({ where: { id: round.id }, data: { status: "OPEN", openedAt: now } });
        await audit("admin", "round.open", { round: round.number });
        return ok("Open. Doctors can now choose.");
      }
      case "lock": {
        if (round.status !== "OPEN") return fail("Only open choices can be locked.");
        await prisma.round.update({ where: { id: round.id }, data: { status: "LOCKED", lockedAt: now } });
        await audit("admin", "round.lock", { round: round.number });
        return ok("Locked. Doctors can no longer change their choices.");
      }
      case "unlock": {
        if (round.status !== "LOCKED" && round.status !== "ALLOCATED") return fail("Only locked choices can be unlocked.");
        await prisma.round.update({ where: { id: round.id }, data: { status: "OPEN", lockedAt: null } });
        await audit("admin", "round.unlock", { round: round.number });
        return ok("Unlocked. Doctors can edit again.");
      }
      case "publish": {
        if (round.status !== "LOCKED" && round.status !== "ALLOCATED") return fail("Lock the choices before publishing.");
        await prisma.round.update({ where: { id: round.id }, data: { status: "PUBLISHED", publishedAt: now } });
        await audit("admin", "round.publish", { round: round.number });
        return ok("Published. Doctors now see the result as final.");
      }
      case "unpublish": {
        if (round.status !== "PUBLISHED") return fail("Not published.");
        await prisma.round.update({ where: { id: round.id }, data: { status: "LOCKED", publishedAt: null } });
        await audit("admin", "round.unpublish", { round: round.number });
        return ok("Unpublished. Doctors see it as not final again.");
      }
      default:
        return fail("Unknown step.");
    }
  });
}

export async function overrideAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    const round = await latestRound(Number(str(fd, "number")));
    if (round.status === "DRAFT" || round.status === "OPEN") return fail("Lock the choices before placing anyone manually.");
    const candidateId = str(fd, "candidateId");
    const hospitalId = str(fd, "hospitalId") || null;
    const note = str(fd, "note");
    if (!note) return fail("A note is required for a manual placement.");

    const ctx = await loadRoundContext(round);
    if (!ctx.candidates.some((c) => c.id === candidateId)) return fail("Doctor not found.");
    if (hospitalId) {
      const h = ctx.hospitals.find((x) => x.id === hospitalId);
      if (!h) return fail("Hospital not found.");
      // Manual placements are fixed first; everyone else is allocated around them.
      const used = ctx.overrides.filter((a) => a.hospitalId === hospitalId && a.candidateId !== candidateId).length;
      if (used >= h.vacancies) return fail(`All ${h.vacancies} seat${h.vacancies === 1 ? "" : "s"} at ${h.name} are already used by manual placements.`);
    }
    await prisma.allocation.upsert({
      where: { roundId_candidateId: { roundId: round.id, candidateId } },
      update: { hospitalId, choiceRank: null, reason: "manual", overridden: true, overrideNote: note },
      create: { roundId: round.id, candidateId, hospitalId, choiceRank: null, reason: "manual", overridden: true, overrideNote: note },
    });
    await audit("admin", "allocation.override", { round: round.number, candidateId, hospitalId, note });
    return ok("Placed manually; everyone else is allocated around it.");
  });
}

export async function clearOverrideAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    const round = await latestRound(Number(str(fd, "number")));
    await prisma.allocation.deleteMany({ where: { roundId: round.id, candidateId: str(fd, "candidateId"), overridden: true } });
    await audit("admin", "allocation.override.clear", { round: round.number, candidateId: str(fd, "candidateId") });
    return ok("Manual placement removed.");
  });
}

/* ───────────── Settings ───────────── */

export async function deadlineAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    const round = await getCurrentRound();
    const raw = str(fd, "deadline");
    const deadline = raw ? fromColomboInput(raw) : null;
    if (raw && !deadline) return fail("Enter a valid date and time.");
    await prisma.round.update({ where: { id: round.id }, data: { deadline } });
    await audit("admin", "deadline.set", { round: round.number, deadline: deadline?.toISOString() ?? null });
    return ok(deadline ? "Deadline saved." : "Deadline cleared.");
  });
}

export async function resetEverythingAction(_p: Result | null, fd: FormData) {
  return guard(async () => {
    if (str(fd, "confirm") !== "RESET") return fail('Type RESET (capitals) to confirm.');
    await prisma.$transaction([
      prisma.choice.deleteMany({}),
      prisma.allocation.deleteMany({}),
      prisma.round.deleteMany({ where: { number: { gt: 1 } } }),
      prisma.setting.deleteMany({ where: { key: { startsWith: "trace:" } } }),
      prisma.round.upsert({
        where: { number: 1 },
        update: { status: "DRAFT", deadline: null, openedAt: null, lockedAt: null, allocatedAt: null, publishedAt: null },
        create: { number: 1 },
      }),
    ]);
    await audit("admin", "reset", {});
    return ok("Everything was reset: no choices or manual placements, and choices are back to not open.");
  });
}
