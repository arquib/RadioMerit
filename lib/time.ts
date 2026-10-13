// All user-facing times are Asia/Colombo (UTC+5:30, no daylight saving).
const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Colombo",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const formatColombo = (d: Date) => `${fmt.format(d).replace(",", "")} (Sri Lanka time)`;

/** Value for <input type="datetime-local"> in Colombo time. */
export function toColomboInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 16);
}

/** "2026-10-20T18:00" typed in Colombo time → Date. */
export function fromColomboInput(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  const d = new Date(`${s}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}
