import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

// Rehearsal helper: if there are no hospitals yet, adds six fake "TEST" hospitals (18 seats, fewer than the 23
// doctors); then writes random 3-hospital choices (about half naming a consultant) for every active doctor.
// Refuses to run unless that round is DRAFT or OPEN. Clean up with Settings → Reset everything,
// then delete the TEST hospitals on the Hospitals page.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const shuffle = <T,>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

async function main() {
  const round = await prisma.round.findFirst({ orderBy: { number: "desc" } });
  if (!round) throw new Error("No round exists; run the seed first.");
  if (round.status !== "DRAFT" && round.status !== "OPEN") throw new Error(`Round ${round.number} is ${round.status}; refusing to write choices.`);

  const names = ["TEST Kandy", "TEST Galle", "TEST Jaffna", "TEST Karapitiya", "TEST Kurunegala", "TEST Anuradhapura"];
  if ((await prisma.hospital.count()) === 0) for (const [i, name] of names.entries()) {
    await prisma.hospital.upsert({ where: { name }, update: {}, create: { name, vacancies: 3, sortOrder: 100 + i } });
  }

  const consultants = await prisma.consultant.findMany();
  const [hospitals, candidates, earlier] = await Promise.all([
    prisma.hospital.findMany(),
    prisma.candidate.findMany({ where: { active: true } }),
    prisma.allocation.findMany({ where: { round: { number: { lt: round.number } }, hospitalId: { not: null } } }),
  ]);
  const taken = new Map<string, number>();
  for (const a of earlier) taken.set(a.hospitalId!, (taken.get(a.hospitalId!) ?? 0) + 1);
  const open = hospitals.filter((h) => h.vacancies - (taken.get(h.id) ?? 0) > 0);
  const placed = new Set(earlier.map((a) => a.candidateId));
  const required = Math.min(3, open.length);

  await prisma.choice.deleteMany({ where: { roundId: round.id } });
  let n = 0;
  for (const c of candidates.filter((c) => !placed.has(c.id))) {
    const picks = shuffle(open).slice(0, Math.min(required, c.order));
    const pickConsultant = (hospitalId: string) => {
      const list = consultants.filter((x) => x.hospitalId === hospitalId);
      return list.length && Math.random() < 0.5 ? shuffle(list)[0].id : null;
    };
    await prisma.choice.createMany({
      data: picks.map((h, i) => ({ roundId: round.id, candidateId: c.id, rank: i + 1, hospitalId: h.id, consultantId: pickConsultant(h.id) })),
    });
    n++;
  }
  console.log(`round ${round.number}: random choices for ${n} doctors over ${open.length} hospitals`);
}

main().finally(() => prisma.$disconnect());
