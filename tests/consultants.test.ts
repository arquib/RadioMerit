import { describe, expect, it } from "vitest";
import { assignConsultants } from "@/lib/allocate";

const prefs = (o: Record<string, Record<string, string | null>>) =>
  new Map(Object.entries(o).map(([c, m]) => [c, new Map(Object.entries(m))]));
const consultants = [
  { id: "x", hospitalId: "H", seats: 1 },
  { id: "y", hospitalId: "H", seats: 1 },
  { id: "hod", hospitalId: "H", seats: 2 },
];

describe("assignConsultants", () => {
  it("higher merit wins a contested consultant; the loser gets a free one", () => {
    const r = assignConsultants({
      placed: [{ candidateId: "d2", order: 2, hospitalId: "H" }, { candidateId: "d1", order: 1, hospitalId: "H" }],
      preferences: prefs({ d1: { H: "x" }, d2: { H: "x" } }),
      consultants,
    });
    expect(r.get("d1")).toEqual({ consultantId: "x", how: "preferred" });
    expect(r.get("d2")).toEqual({ consultantId: "y", how: "fallback" });
  });

  it("a named preference beats a higher-ranked 'any' (who does not mind)", () => {
    const r = assignConsultants({
      placed: [{ candidateId: "d1", order: 1, hospitalId: "H" }, { candidateId: "d2", order: 2, hospitalId: "H" }],
      preferences: prefs({ d1: { H: null }, d2: { H: "x" } }),
      consultants,
    });
    expect(r.get("d2")).toEqual({ consultantId: "x", how: "preferred" });
    expect(r.get("d1")).toEqual({ consultantId: "y", how: "any" });
  });

  it("a consultant with 2 seats takes two doctors; then seats run out", () => {
    const placed = ["a", "b", "c", "d", "e"].map((id, i) => ({ candidateId: id, order: i + 1, hospitalId: "H" }));
    const r = assignConsultants({ placed, preferences: prefs({ a: { H: "hod" }, b: { H: "hod" }, c: { H: "hod" } }), consultants });
    expect(r.get("a")?.consultantId).toBe("hod");
    expect(r.get("b")?.consultantId).toBe("hod");
    expect(r.get("c")).toEqual({ consultantId: "x", how: "fallback" });
    expect(r.get("d")).toEqual({ consultantId: "y", how: "any" });
    expect(r.get("e")).toEqual({ consultantId: null, how: "unassigned" });
  });

  it("uses the preference for the hospital the doctor actually got; hospitals without consultants give 'none'", () => {
    const r = assignConsultants({
      placed: [{ candidateId: "d1", order: 1, hospitalId: "H" }, { candidateId: "d2", order: 2, hospitalId: "K" }],
      preferences: prefs({ d1: { G: "zzz", H: "y" }, d2: { K: null } }),
      consultants,
    });
    expect(r.get("d1")).toEqual({ consultantId: "y", how: "preferred" });
    expect(r.get("d2")).toEqual({ consultantId: null, how: "none" });
  });

  it("ignores a preference for a consultant at another hospital", () => {
    const r = assignConsultants({ placed: [{ candidateId: "d1", order: 1, hospitalId: "H" }], preferences: prefs({ d1: { H: "elsewhere" } }), consultants });
    expect(r.get("d1")).toEqual({ consultantId: "x", how: "fallback" });
  });
});
