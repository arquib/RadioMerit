import { describe, expect, it } from "vitest";
import { allocate, type Candidate } from "@/lib/allocate";

const cands = (n: number, inactive: number[] = []): Candidate[] =>
  Array.from({ length: n }, (_, i) => ({ id: `d${i + 1}`, order: i + 1, active: !inactive.includes(i + 1) }));
const cap = (o: Record<string, number>) => new Map(Object.entries(o));
const ch = (o: Record<string, string[]>) => new Map(Object.entries(o));
const where = (r: ReturnType<typeof allocate>, id: string) => r.allocations.find((a) => a.candidateId === id)!;

describe("allocate", () => {
  it("worked example: A=1, B=1", () => {
    const r = allocate({
      candidates: cands(3),
      choices: ch({ d1: ["A", "B", "C"], d2: ["A", "B", "C"], d3: ["A", "B", "C"] }),
      capacity: cap({ A: 1, B: 1, C: 0 }),
    });
    expect(where(r, "d1")).toMatchObject({ hospitalId: "A", choiceRank: 1, reason: "allocated" });
    expect(where(r, "d2")).toMatchObject({ hospitalId: "B", choiceRank: 2 });
    expect(where(r, "d3")).toMatchObject({ hospitalId: null, reason: "all_choices_full" });
    expect(r.remaining.get("A")).toBe(0);
  });

  it("everyone gets their 1st choice when seats allow", () => {
    const r = allocate({
      candidates: cands(3),
      choices: ch({ d1: ["A", "B", "C"], d2: ["B", "A", "C"], d3: ["C", "A", "B"] }),
      capacity: cap({ A: 1, B: 1, C: 1 }),
    });
    expect(r.allocations.map((a) => a.choiceRank)).toEqual([1, 1, 1]);
  });

  it("is independent of the input order of candidates", () => {
    const base = {
      choices: ch({ d1: ["A", "B", "C"], d2: ["A", "B", "C"], d3: ["A", "C", "B"] }),
      capacity: cap({ A: 1, B: 1, C: 1 }),
    };
    const a = allocate({ ...base, candidates: cands(3) });
    const b = allocate({ ...base, candidates: [...cands(3)].reverse() });
    const flat = (r: typeof a) => r.allocations.map((x) => `${x.candidateId}:${x.hospitalId}`).sort();
    expect(flat(b)).toEqual(flat(a));
    expect(b.trace).toEqual(a.trace);
  });

  it("no choices and withdrawn doctors: withdrawn takes no seat", () => {
    const r = allocate({
      candidates: cands(3, [1]),
      choices: ch({ d1: ["A", "B", "C"], d3: ["A", "B", "C"] }),
      capacity: cap({ A: 1, B: 1, C: 1 }),
    });
    expect(where(r, "d1").reason).toBe("withdrawn");
    expect(where(r, "d2").reason).toBe("no_choices");
    expect(where(r, "d3")).toMatchObject({ hospitalId: "A", choiceRank: 1 });
  });

  it("hospital with 0 seats is full; fewer seats than doctors leaves the tail unallocated", () => {
    const r = allocate({
      candidates: cands(4),
      choices: ch(Object.fromEntries([1, 2, 3, 4].map((i) => [`d${i}`, ["Z", "A", "B"]]))),
      capacity: cap({ Z: 0, A: 1, B: 1 }),
    });
    const placed = r.allocations.filter((a) => a.hospitalId);
    expect(placed).toHaveLength(2);
    expect(where(r, "d3").reason).toBe("all_choices_full");
    expect(where(r, "d4").reason).toBe("all_choices_full");
  });

  it("pre-deducts seats of manual placements and skips those doctors", () => {
    const r = allocate({
      candidates: cands(3),
      choices: ch({ d1: ["A", "B"], d2: ["A", "B"], d3: ["A", "B"] }),
      capacity: cap({ A: 1, B: 1 }),
      fixed: new Map([["d3", "A"]]),
    });
    expect(r.allocations.find((a) => a.candidateId === "d3")).toBeUndefined();
    expect(where(r, "d1")).toMatchObject({ hospitalId: "B", choiceRank: 2 });
    expect(where(r, "d2").reason).toBe("all_choices_full");
    expect(r.trace[0]).toMatch(/placed manually/);
  });

  it("round 2: only the unallocated, on remaining capacity", () => {
    const base = cap({ A: 1, B: 2, C: 1 });
    const r1 = allocate({
      candidates: cands(4),
      choices: ch({ d1: ["A", "B"], d2: ["A", "B"], d3: ["A", "C"], d4: ["A", "C"] }),
      capacity: base,
    });
    // d1→A, d2→B, d3→C, d4 unallocated (A, C full)
    expect(where(r1, "d4").reason).toBe("all_choices_full");
    expect(r1.remaining.get("B")).toBe(1);
    const r2 = allocate({
      candidates: cands(4).filter((c) => where(r1, c.id).reason !== "allocated"),
      choices: ch({ d4: ["B"] }),
      capacity: r1.remaining,
    });
    expect(r2.allocations).toEqual([{ candidateId: "d4", hospitalId: "B", choiceRank: 1, reason: "allocated" }]);
  });

  it("trace is readable", () => {
    const r = allocate({
      candidates: cands(2),
      choices: ch({ d1: ["K"], d2: ["K", "G"] }),
      capacity: cap({ K: 1, G: 1 }),
      hospitalNames: new Map([["K", "Kandy"], ["G", "Galle"]]),
    });
    expect(r.trace).toEqual(["#1 1st Kandy ✓ (0 left)", "#2 1st Kandy full → 2nd Galle ✓ (0 left)"]);
  });
});
