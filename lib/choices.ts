import { z } from "zod";

export const MAX_CHOICES = 3;

/**
 * How many hospitals a doctor ranks: 3, but merit #1 ranks only 1 (they always get it) and #2 only 2
 * (only #1 can take a seat before them); never more than the hospitals that exist.
 */
export const requiredChoices = (availableHospitals: number, meritOrder = Infinity) =>
  Math.min(MAX_CHOICES, meritOrder, Math.max(0, availableHospitals));

/** The ranked list a doctor submits: exactly `required` distinct hospitals that exist. */
export function choiceSchema(required: number, available: ReadonlySet<string>) {
  return z
    .array(z.string().min(1, "Choose a hospital for every rank"))
    .length(required, `Choose exactly ${required} hospital${required === 1 ? "" : "s"}`)
    .refine((ids) => new Set(ids).size === ids.length, "Each hospital can only be chosen once")
    .refine((ids) => ids.every((id) => available.has(id)), "One of the hospitals no longer exists. Reload the page");
}
