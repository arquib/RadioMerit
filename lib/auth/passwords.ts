import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Role } from "./token";

const digest = (s: string) => createHash("sha256").update(s).digest();

function matches(input: string, expected: string | undefined) {
  if (!expected) return false;
  return timingSafeEqual(digest(input), digest(expected)); // equal-length digests, constant time
}

/** Which role a typed password unlocks. Both comparisons always run. */
export function roleForPassword(input: string): Role | null {
  const admin = matches(input, process.env.ADMIN_PASSWORD);
  const doctor = matches(input, process.env.DOCTOR_PASSWORD);
  return admin ? "admin" : doctor ? "doctor" : null;
}
