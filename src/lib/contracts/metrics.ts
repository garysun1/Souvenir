import { z } from "zod";
import type { PlaceMetricsDto } from "../../../shared/worldwide-contract";
import { countrySchema, sampleStatusSchema } from "@/lib/schemas/worldwide";
import { instantSchema } from "./primitives";

export const METRIC_DEFINITION_VERSION = 1;
export const MINIMUM_PUBLIC_SAMPLE = 5;
const count = z.number().int().nonnegative();
const rate = z.number().finite().min(0).max(1).nullable();
const day = 86_400_000;
const near = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-9;
export const placeMetricsSchema = z
  .object({
    provenance: z.literal("souvenir-activity"),
    definitionVersion: z.literal(METRIC_DEFINITION_VERSION),
    computedAt: instantSchema,
    sampleStatus: sampleStatusSchema,
    collectors: count,
    editions: count,
    saves: count,
    discoveryFreq: rate,
    frequency: z
      .object({
        status: sampleStatusSchema,
        visitors90d: count,
        cityVisitors90d: count,
        city: z.string().min(1).max(200).nullable(),
        country: countrySchema.nullable(),
        windowStart: instantSchema,
        windowEnd: instantSchema,
        minimumCohort: z.literal(MINIMUM_PUBLIC_SAMPLE),
      })
      .strict(),
    recommendRate: rate,
    sentiment: z
      .object({
        status: sampleStatusSchema,
        recommend: count,
        depends: count,
        skip: count,
        minimumSample: z.literal(MINIMUM_PUBLIC_SAMPLE),
      })
      .strict(),
    trendingScore: z.number().finite().nonnegative().nullable(),
    trend: z
      .object({
        status: sampleStatusSchema,
        collectors7d: count,
        weeklyCollectors8w: z.array(count).length(8),
        collectors8wAvg: z.number().finite().nonnegative().nullable(),
        baselineStart: instantSchema,
        baselineEnd: instantSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((metric, context) => {
    const fail = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
    const frequency = metric.frequency;
    const end = Date.parse(frequency.windowEnd);
    if (frequency.cityVisitors90d < frequency.visitors90d)
      fail("Cohort must include place visitors");
    if (end - Date.parse(frequency.windowStart) !== 90 * day) fail("Frequency requires 90 days");
    if (Date.parse(metric.computedAt) < end) fail("Computation cannot precede the window");
    if (
      metric.discoveryFreq !== null &&
      (!frequency.city ||
        !frequency.country ||
        frequency.cityVisitors90d < MINIMUM_PUBLIC_SAMPLE ||
        !near(metric.discoveryFreq, frequency.visitors90d / frequency.cityVisitors90d))
    )
      fail("Frequency needs a known locality and a cohort of at least five");
    if (frequency.status === "ready" && metric.discoveryFreq === null)
      fail("Ready frequency needs a value");
    const sentiment = metric.sentiment;
    const raters = sentiment.recommend + sentiment.depends + sentiment.skip;
    if (
      metric.recommendRate !== null &&
      (raters < MINIMUM_PUBLIC_SAMPLE || !near(metric.recommendRate, sentiment.recommend / raters))
    )
      fail("Recommendation uses all three sentiments and at least five raters");
    if (sentiment.status === "ready" && metric.recommendRate === null)
      fail("Ready sentiment needs a value");
    const trend = metric.trend;
    const baselineEnd = Date.parse(trend.baselineEnd);
    const date = new Date(baselineEnd);
    if (
      baselineEnd - Date.parse(trend.baselineStart) !== 56 * day ||
      baselineEnd > end - 7 * day ||
      baselineEnd <= end - 14 * day ||
      date.getUTCDay() !== 1 ||
      date.getUTCHours() !== 0 ||
      date.getUTCMinutes() !== 0 ||
      date.getUTCSeconds() !== 0 ||
      date.getUTCMilliseconds() !== 0
    ) {
      fail("Trend baseline is eight complete UTC ISO weeks before the last seven days");
    }
    const average = trend.weeklyCollectors8w.reduce((sum, value) => sum + value, 0) / 8;
    if (trend.collectors8wAvg !== null && !near(trend.collectors8wAvg, average))
      fail("Incorrect baseline average");
    if (
      metric.trendingScore !== null &&
      (average === 0 ||
        trend.collectors8wAvg === null ||
        !near(metric.trendingScore, trend.collectors7d / average))
    )
      fail("Trend needs a nonzero distinct-collector baseline");
    if (trend.status === "ready" && metric.trendingScore === null)
      fail("Ready trend needs a value");
  }) satisfies z.ZodType<PlaceMetricsDto>;
