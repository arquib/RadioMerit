import { describe, expect, it } from "vitest";
import { choiceSchema, requiredChoices } from "@/lib/choices";

const avail = new Set(["A", "B", "C", "D"]);

describe("requiredChoices", () => {
  it("merit #1 ranks 1, #2 ranks 2, everyone else 3 (capped by hospitals)", () => {
    expect([1, 2, 3, 23].map((o) => requiredChoices(8, o))).toEqual([1, 2, 3, 3]);
    expect(requiredChoices(1, 2)).toBe(1);
  });
  it("is 3, or fewer when fewer hospitals have seats", () => {
    expect([0, 1, 2, 3, 9].map(requiredChoices)).toEqual([0, 1, 2, 3, 3]);
  });
});

describe("choiceSchema", () => {
  const ok = (v: string[], req = 3, a = avail) => choiceSchema(req, a).safeParse(v).success;
  it("accepts exactly the required number of distinct available hospitals", () => {
    expect(ok(["A", "B", "C"])).toBe(true);
  });
  it("rejects too few, too many, duplicates, blanks and unknown hospitals", () => {
    expect(ok(["A", "B"])).toBe(false);
    expect(ok(["A", "B", "C", "D"])).toBe(false);
    expect(ok(["A", "A", "B"])).toBe(false);
    expect(ok(["A", "", "B"])).toBe(false);
    expect(ok(["A", "B", "Z"])).toBe(false);
  });
  it("round 2 with fewer seats: min(3, available)", () => {
    expect(ok(["A", "B"], 2, new Set(["A", "B"]))).toBe(true);
    expect(ok(["A", "B", "C"], 2, new Set(["A", "B"]))).toBe(false);
  });
});
