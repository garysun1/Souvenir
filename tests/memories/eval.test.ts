import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { SYNTHETIC_IMAGES, TASTE_EVAL_CASES } from "./eval-fixtures";
import { scoreTasteEvaluation } from "./run-eval";
import { validateTasteResult } from "@/lib/ai/taste";

describe("synthetic evaluation harness", () => {
  it("has unique cases and rasterizable original images", async () => {
    expect(new Set(TASTE_EVAL_CASES.map((c) => c.id)).size).toBe(TASTE_EVAL_CASES.length);
    for (const svg of Object.values(SYNTHETIC_IMAGES)) {
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      expect((await sharp(png).metadata()).width).toBe(512);
    }
  });
  it("counts unsupported categories and failures to abstain without claiming model quality", () => {
    const result = {
      title: null,
      observations: [
        {
          source: TASTE_EVAL_CASES[0].sources[0].source,
          interest: "museums" as const,
          intent: "want_to_try" as const,
          confidence: 0.8,
          explanation: "Synthetic wrong answer",
        },
      ],
    };
    expect(scoreTasteEvaluation(TASTE_EVAL_CASES[0], result)).toEqual({
      missingInterests: ["gardens"],
      unsupportedInterests: ["museums"],
      abstentionCorrect: true,
    });
    expect(scoreTasteEvaluation(TASTE_EVAL_CASES[4], result).abstentionCorrect).toBe(false);
    expect(() => validateTasteResult(result, TASTE_EVAL_CASES[4].sources)).toThrow();
  });
});
