import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

// Idempotent: candidates are upserted by merit order (names you edited in the admin UI are kept),
// and Round 1 is created in DRAFT only if no round exists yet.
// The bundled list is synthetic ("Demo Doctor NN"). To load a real list without committing it, point
// MERIT_LIST_CSV at a file with the header `order,indexNo,name`.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const lines = readFileSync(process.env.MERIT_LIST_CSV ?? new URL("./seed-data/merit-list.csv", import.meta.url), "utf8").trim().split("\n").slice(1);
  for (const line of lines) {
    const [order, indexNo, ...rest] = line.split(",");
    const name = rest.join(",").trim();
    await prisma.candidate.upsert({
      where: { order: Number(order) },
      update: {},
      create: { order: Number(order), indexNo: indexNo.trim(), name },
    });
  }
  await prisma.round.upsert({ where: { number: 1 }, update: {}, create: { number: 1 } });
  console.log(`seeded ${lines.length} candidates`);
}

main().finally(() => prisma.$disconnect());
