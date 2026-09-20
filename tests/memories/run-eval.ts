import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { tasteProvider } from "@/lib/ai/taste";
import { TASTE_EVAL_CASES, SYNTHETIC_IMAGES } from "./eval-fixtures";
import type { TasteAnalysisResult, TasteInterest } from "../../shared/memories-contract";

export function scoreTasteEvaluation(
  fixture: Pick<(typeof TASTE_EVAL_CASES)[number], "expected" | "allowed" | "abstain">,
  result: TasteAnalysisResult,
) {
  const actual = new Set<TasteInterest>(
    result.observations.map((observation) => observation.interest),
  );
  return {
    missingInterests: fixture.expected.filter((interest) => !actual.has(interest)),
    unsupportedInterests: [...actual].filter((interest) => !fixture.allowed.includes(interest)),
    abstentionCorrect: fixture.abstain
      ? result.observations.length === 0
      : result.observations.length > 0,
  };
}

async function main() {
  const live = process.argv.includes("--live");
  const baseArgument = process.argv.find((arg) => arg.startsWith("--images-base-url="));
  const imageBase = baseArgument ? new URL(baseArgument.slice("--images-base-url=".length)) : null;
  if (
    imageBase &&
    (imageBase.protocol !== "https:" ||
      imageBase.username ||
      imageBase.password ||
      imageBase.search)
  )
    throw new Error("Use an HTTPS directory containing only the generated synthetic PNG fixtures.");
  if (imageBase && !imageBase.pathname.endsWith("/")) imageBase.pathname += "/";
  const out = path.resolve("tests/memories/eval-output");
  await mkdir(out, { recursive: true });
  for (const [name, svg] of Object.entries(SYNTHETIC_IMAGES))
    await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(out, `${name}.png`));
  const reports: object[] = [];
  for (const fixture of TASTE_EVAL_CASES) {
    if (!live || (fixture.image && !imageBase)) {
      reports.push({
        id: fixture.id,
        status: "not_run",
        reason: !live
          ? "Live evaluation requires --live."
          : "Synthetic image hosting was not supplied.",
      });
      continue;
    }
    try {
      const sources = fixture.sources.map((source) => ({
        ...source,
        ...(fixture.image && imageBase
          ? { imageUrl: new URL(`${fixture.image}.png`, imageBase).href }
          : {}),
      }));
      const startedAt = Date.now();
      const result = await tasteProvider.analyze(sources, fixture.note);
      const score = scoreTasteEvaluation(fixture, result);
      reports.push({
        id: fixture.id,
        status: "executed",
        durationMs: Date.now() - startedAt,
        score,
        result,
        semanticReviewRequired:
          "Review free-text claims, sensitive inference and uncertainty manually.",
      });
    } catch (error) {
      reports.push({
        id: fixture.id,
        status: "rejected",
        message: error instanceof Error ? error.message : "Evaluation failed.",
      });
    }
  }
  const report = {
    mode: live ? "live" : "offline",
    license: "Original synthetic fixtures, CC0-1.0",
    reports,
  };
  await writeFile(path.join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1]?.endsWith("run-eval.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Evaluation failed.");
    process.exitCode = 1;
  });
}
