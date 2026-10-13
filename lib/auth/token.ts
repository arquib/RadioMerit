import { createHmac, timingSafeEqual } from "node:crypto";

// Signed session token: base64url(JSON payload) + "." + HMAC-SHA256. No server-side session store.
export type Role = "admin" | "doctor";
// Doctors additionally carry the candidate they picked from the merit list.
export type Session = { role: Role; exp: number; candidateId?: string };

export const COOKIE = "radiomerit_session";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is missing or too short");
  return s;
}

const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export function encodeSession(s: Session): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined): Session | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
    if ((s.role !== "admin" && s.role !== "doctor") || typeof s.exp !== "number" || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}
