import type { ConsultantHow } from "@/lib/allocate";

export type ResultRow = {
  candidateId: string;
  order: number;
  name: string;
  indexNo: string;
  hospitalId: string | null;
  hospital: string | null;
  consultantId: string | null;
  consultant: string | null;
  consultantHow: ConsultantHow;
  choiceRank: number | null;
  reason: string;
  manual: boolean;
  note: string | null;
};

const REASONS: Record<string, string> = {
  all_choices_full: "all choices full",
  no_choices: "no choices submitted",
  withdrawn: "withdrawn",
};
export const reasonLabel = (reason: string) => REASONS[reason] ?? "";

/** There is no second round: anyone without a seat is simply "Not allocated". */
export const hospitalLabel = (r: Pick<ResultRow, "hospital" | "reason">) =>
  r.hospital ?? (r.reason === "withdrawn" ? "Withdrawn" : "Not allocated");

const HOW: Record<ConsultantHow, string> = {
  preferred: "preferred",
  fallback: "assigned: preferred consultant taken",
  any: "assigned",
  unassigned: "consultant to be arranged",
  none: "",
};
export const consultantHowLabel = (h: ConsultantHow) => HOW[h];
