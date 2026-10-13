export type Result = { ok: boolean; message: string };
export const ok = (message: string): Result => ({ ok: true, message });
export const fail = (message: string): Result => ({ ok: false, message });
