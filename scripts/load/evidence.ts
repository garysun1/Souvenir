import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const evidenceSchema = z.object({
  runId: z.string(),
  generatedAt: z.string(),
  anchor: z.string(),
  mode: z.string(),
  fixtureHash: z.string(),
  poolHash: z.string().nullable(),
  processElapsedSeconds: z.number(),
  sampledAccountIndexes: z.array(z.number()),
  counts: z.record(z.unknown()).optional(),
  hardware: z.record(z.unknown()).optional(),
  checks: z.array(
    z.object({ name: z.string(), status: z.string(), detail: z.string().optional() }),
  ),
  latency: z.array(
    z.object({
      route: z.string(),
      count: z.number(),
      p50Ms: z.number(),
      p95Ms: z.number(),
      p99Ms: z.number().optional(),
      maxMs: z.number(),
      responseStatuses: z.record(z.number()),
    }),
  ),
  stockPhotos: z
    .array(
      z.object({
        sourceId: z.string(),
        photographer: z.string(),
        sourceUrl: z.string(),
        licenseUrl: z.string(),
        attribution: z.string(),
        width: z.number(),
        height: z.number(),
        bytes: z.number(),
        sha256: z.string(),
        fetchedAt: z.string(),
      }),
    )
    .optional(),
});
const json = (value: unknown) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

export function writeEvidence(dir: string) {
  const report = evidenceSchema.parse(
    JSON.parse(readFileSync(resolve(dir, "report.json"), "utf8")),
  );
  const cleanupPath = resolve(dir, "cleanup.json");
  const cleanup: unknown = existsSync(cleanupPath)
    ? JSON.parse(readFileSync(cleanupPath, "utf8"))
    : null;
  const failures = report.checks.filter((check) => check.status !== "passed");
  const markdown =
    [
      `# Local worldwide validation — ${report.runId}`,
      `Generated ${report.generatedAt}. Mode: ${report.mode}.`,
      `**Verdict:** ${failures.length ? `${failures.length} failed/blocked checks; validation is not fully green.` : "All recorded checks passed."}`,
      "## Scope and reproducibility",
      "Real local Supabase Auth, private Storage and PostgreSQL with authenticated bearer requests to a production Next HTTP server. No hosted database or external provider writes, real emails, public deployment, or UI testing.",
      `Fixture hash: \`${report.fixtureHash}\`. Stock pool hash: \`${report.poolHash}\`. Anchor: ${report.anchor}.`,
      `This report process took ${report.processElapsedSeconds.toFixed(2)} seconds. See run/resume latency archives for total workload timing when this is a later verification process.`,
      "API-created profiles, editions, friendships, saves, rankings, notes and tags are independently queried in PostgreSQL. Synthetic catalog ingestion, recorded-resource cleanup and full-stat recomputation are deliberate direct-database maintenance operations.",
      "## Counts and eight-city distribution",
      json(report.counts ?? null),
      "## Hardware and bounded concurrency",
      json(report.hardware ?? null),
      "## HTTP timings (milliseconds)",
      "Nearest-rank percentiles include response-body consumption and unsuccessful HTTP responses. Per-process route samples mix that process's workload and verification; Auth creation, Storage transfers and SQL-oracle time are outside these HTTP route timings. No 300 ms target is promised for unmeasured routes or production infrastructure.",
      "| Route | Count | p50 | p95 | p99 | Max | Status counts |",
      "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
      ...report.latency.map(
        (row) =>
          `| ${row.route} | ${row.count} | ${row.p50Ms.toFixed(2)} | ${row.p95Ms.toFixed(2)} | ${row.p99Ms?.toFixed(2) ?? "unrecorded"} | ${row.maxMs.toFixed(2)} | ${JSON.stringify(row.responseStatuses)} |`,
      ),
      "## API versus SQL and adversarial checks",
      `Profile sample indexes: ${report.sampledAccountIndexes.join(", ")}. Place/social comparison: 100 viewer/place combinations plus one fixture per city. Full totals and feed eligibility use SQL; this is sampled API parity, not exhaustive parity of every field for all users.`,
      ...report.checks.map(
        (check) =>
          `- **${check.status}** — ${check.name}${check.detail ? `\n\n${check.detail}` : ""}`,
      ),
      "## Query plans",
      "The machine report includes EXPLAIN ANALYZE BUFFERS JSON after ANALYZE with default optimizer settings, actual/estimated rows, loops, filter removals, buffers and execution times. Probes represent collection, collector count, feed eligibility, nearby distance and leaderboard aggregation. They are approximations of request query shapes and do not imply every endpoint uses an index. Assess sequential scans against cardinalities and measured costs.",
      "## Stock photo manifest and license",
      `${report.stockPhotos?.length ?? 0} explicitly selected Lorem Picsum photos are recorded below with Unsplash source/photographer attribution. The Unsplash license permits this local synthetic use; it does not authorize resale without significant modification or a competing stock service. Stock captures are private and never asserted to depict a destination or promoted into destination heroes. Cached JPEG bytes plus pool.json must be preserved together for deterministic reruns.`,
      ...(report.stockPhotos ?? []).map((photo) =>
        [
          `### Picsum ${photo.sourceId} — ${photo.photographer}`,
          `Source: ${photo.sourceUrl}. License: ${photo.licenseUrl}.`,
          photo.attribution,
          `${photo.width} × ${photo.height}; ${photo.bytes} bytes; fetched ${photo.fetchedAt}. SHA-256: \`${photo.sha256}\`.`,
        ].join("\n\n"),
      ),
      "## Scoped cleanup",
      cleanup
        ? json(cleanup)
        : "Cleanup not yet recorded. Run the cleanup command and regenerate this report.",
      "## Gaps and limits",
      "No browser/mobile acceptance, production deployment, external provider/API quality, live Elasticsearch, or production destination licensing validation is implied. Fixtures have synthetic coordinates/names, null heroes, and no invented hours/prices. Legacy rarity-tier compatibility values are not a validated city-percentile implementation; percentile/tie semantics remain an integration decision.",
      "MIME/size tests validate declared metadata and bucket limits; they do not assert that image contents are decoded or sniffed. Authenticated privacy tests cover sampled routes and revoked PostgREST grants, not a formal security audit.",
      "Root/service checks and any server defect reproductions belong in the accompanying session evidence; this generated report claims only the checks it records. Intermediate run failures remain archived rather than overwritten by later green results.",
    ].join("\n\n") + "\n";
  writeFileSync(resolve(dir, "report.md"), markdown, { mode: 0o600 });
}
