import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

export async function audit(actor: string, action: string, detail?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({ data: { actor, action, detail } });
}
