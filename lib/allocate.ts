// Serial dictatorship by merit. Pure: no database, no clock, no randomness.
// Doctors are processed in merit order; each gets the first of their ranked hospitals that still has a seat.

export type Candidate = { id: string; order: number; active: boolean };

export type AllocateInput = {
  candidates: Candidate[]; // any order; sorted by `order` inside
  choices: Map<string, string[]>; // candidateId -> hospitalIds in rank order
  capacity: Map<string, number>; // hospitalId -> seats available this round
  /** Manual overrides: candidates already placed by the admin. Their seat (if any) is taken first and they are skipped. */
  fixed?: Map<string, string | null>;
  /** Display names, used only to make the trace readable. */
  hospitalNames?: Map<string, string>;
};

export type AllocationReason = "allocated" | "all_choices_full" | "no_choices" | "withdrawn";

export type AllocationResult = {
  candidateId: string;
  hospitalId: string | null;
  choiceRank: 1 | 2 | 3 | null;
  reason: AllocationReason;
};

export type AllocateOutput = {
  allocations: AllocationResult[]; // excludes `fixed` candidates (the caller keeps those rows)
  trace: string[];
  remaining: Map<string, number>;
};

const ordinal = ["1st", "2nd", "3rd"];

export function allocate(input: AllocateInput): AllocateOutput {
  const name = (id: string) => input.hospitalNames?.get(id) ?? id;
  const remaining = new Map(input.capacity);
  const trace: string[] = [];
  const seatsLeft = (h: string) => Math.max(0, remaining.get(h) ?? 0);

  // Manual placements first: their seats are gone before anyone is processed.
  const fixed = input.fixed ?? new Map<string, string | null>();
  const byOrder = [...input.candidates].sort((a, b) => a.order - b.order);
  for (const c of byOrder) {
    if (!fixed.has(c.id)) continue;
    const h = fixed.get(c.id) ?? null;
    if (h) {
      remaining.set(h, seatsLeft(h) - 1);
      trace.push(`#${c.order} placed manually at ${name(h)} (seat taken before allocation; ${seatsLeft(h)} left)`);
    } else {
      trace.push(`#${c.order} left unplaced manually`);
    }
  }

  const allocations: AllocationResult[] = [];
  for (const c of byOrder) {
    if (fixed.has(c.id)) continue;
    if (!c.active) {
      trace.push(`#${c.order} withdrawn, skipped`);
      allocations.push({ candidateId: c.id, hospitalId: null, choiceRank: null, reason: "withdrawn" });
      continue;
    }
    const picks = input.choices.get(c.id) ?? [];
    if (picks.length === 0) {
      trace.push(`#${c.order} has no saved choices`);
      allocations.push({ candidateId: c.id, hospitalId: null, choiceRank: null, reason: "no_choices" });
      continue;
    }
    const steps: string[] = [];
    let placed: AllocationResult | null = null;
    for (let i = 0; i < picks.length && i < 3; i++) {
      const h = picks[i];
      if (seatsLeft(h) > 0) {
        remaining.set(h, seatsLeft(h) - 1);
        steps.push(`${ordinal[i]} ${name(h)} ✓ (${seatsLeft(h)} left)`);
        placed = { candidateId: c.id, hospitalId: h, choiceRank: (i + 1) as 1 | 2 | 3, reason: "allocated" };
        break;
      }
      steps.push(`${ordinal[i]} ${name(h)} full`);
    }
    trace.push(`#${c.order} ${steps.join(" → ")}${placed ? "" : " → unallocated"}`);
    allocations.push(placed ?? { candidateId: c.id, hospitalId: null, choiceRank: null, reason: "all_choices_full" });
  }

  for (const [h, n] of remaining) if (n < 0) remaining.set(h, 0);
  return { allocations, trace, remaining };
}

// ───────────── Second stage: consultants inside each hospital ─────────────

export type ConsultantSlot = { id: string; hospitalId: string; seats: number }; // in display order
export type ConsultantHow =
  | "preferred" // got the consultant they asked for
  | "fallback" // asked for a consultant who was taken by a higher-ranked doctor; given a free one
  | "any" // chose "any"; given a free one
  | "unassigned" // the hospital's consultant seats ran out
  | "none"; // the hospital has no consultants listed
export type ConsultantResult = { consultantId: string | null; how: ConsultantHow };

/**
 * Hospitals are allocated first (above); this only decides who works with whom inside a hospital.
 * Pass 1, merit order: doctors who named a consultant get them if a seat is left.
 * Pass 2, merit order: everyone else (chose "any", or their consultant was taken) gets the first consultant with a seat.
 */
export function assignConsultants(input: {
  placed: { candidateId: string; order: number; hospitalId: string }[];
  preferences: Map<string, Map<string, string | null>>; // candidateId -> hospitalId -> consultantId (null = any)
  consultants: ConsultantSlot[];
}): Map<string, ConsultantResult> {
  const left = new Map(input.consultants.map((c) => [c.id, c.seats]));
  const atHospital = (h: string) => input.consultants.filter((c) => c.hospitalId === h);
  const placed = [...input.placed].sort((a, b) => a.order - b.order);
  const out = new Map<string, ConsultantResult>();

  for (const p of placed) {
    const want = input.preferences.get(p.candidateId)?.get(p.hospitalId) ?? null;
    if (want && atHospital(p.hospitalId).some((c) => c.id === want) && (left.get(want) ?? 0) > 0) {
      left.set(want, left.get(want)! - 1);
      out.set(p.candidateId, { consultantId: want, how: "preferred" });
    }
  }
  for (const p of placed) {
    if (out.has(p.candidateId)) continue;
    const list = atHospital(p.hospitalId);
    if (list.length === 0) {
      out.set(p.candidateId, { consultantId: null, how: "none" });
      continue;
    }
    const free = list.find((c) => (left.get(c.id) ?? 0) > 0);
    const wanted = input.preferences.get(p.candidateId)?.get(p.hospitalId);
    if (!free) {
      out.set(p.candidateId, { consultantId: null, how: "unassigned" });
      continue;
    }
    left.set(free.id, left.get(free.id)! - 1);
    out.set(p.candidateId, { consultantId: free.id, how: wanted ? "fallback" : "any" });
  }
  return out;
}
