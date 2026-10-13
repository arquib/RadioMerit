import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getCurrentRound } from "@/lib/rounds";

export default async function Results() {
  await requireAdmin();
  const round = await getCurrentRound();
  redirect(`/admin/round/${round.number}`);
}
