import type { PlaceDetailDto, RankingDto } from "../../../shared/api-contract";
import { frequencyText } from "@/lib/web/worldwide";
import { RecommendationBadge } from "@/components/ui/recommendation-badge";

export function PlaceSignals({ place, ranking }: { place: PlaceDetailDto; ranking?: RankingDto }) {
  const metrics = place.metrics;
  const availability = place.availability;
  return (
    <section className="space-y-3" aria-label="Place signals">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <h2 className="font-serif font-bold text-brand">Personal appeal</h2>
          <p className="mt-1 text-sm">Your taste is personal; no inferred appeal score.</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <h2 className="font-serif font-bold text-brand">Discovery frequency</h2>
          <p className="mt-1 text-sm">{frequencyText(metrics)}</p>
          {metrics && (
            <p className="mt-2 text-xs text-text-secondary">
              {metrics.collectors} public collectors · {metrics.editions} public editions ·{" "}
              {metrics.saves} public saves
            </p>
          )}
        </div>
        <div className="rounded-xl border border-border p-4">
          <h2 className="font-serif font-bold text-brand">Documented availability</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">
            {availability.status === "unknown"
              ? "Unknown — no current documented hours."
              : `${availability.status === "stale" ? "Stale documentation: " : ""}${availability.openingHours ?? "Hours unknown"}`}
          </p>
          <p className="mt-2 text-xs text-text-secondary">
            Timezone: {availability.timezone ?? "unknown"}. This does not verify whether it is open
            now.
          </p>
          {availability.fetchedAt && (
            <p className="text-xs text-text-secondary">
              Documented {new Date(availability.fetchedAt).toLocaleString()}
            </p>
          )}
          {availability.sourceId && (
            <a className="text-xs text-brand underline" href={`#source-${availability.sourceId}`}>
              View hours source
            </a>
          )}
        </div>
        <div className="rounded-xl border border-border p-4">
          <h2 className="font-serif font-bold text-brand">Recommendations</h2>
          <div className="my-2 text-sm">
            Yours: <RecommendationBadge sentiment={ranking?.sentiment} />
          </div>
          <p className="text-sm">
            {metrics?.sentiment.status === "ready" && metrics.recommendRate !== null
              ? `${Math.round(metrics.recommendRate * 100)}% of public raters recommend it.`
              : metrics?.sentiment.status === "stale"
                ? "Public sentiment is stale. Refresh to check again."
                : "Public sentiment unknown — at least 5 ratings are needed."}
          </p>
          {metrics && (
            <p className="mt-1 text-xs text-text-secondary">
              {metrics.sentiment.recommend} recommend · {metrics.sentiment.depends} depends ·{" "}
              {metrics.sentiment.skip} skip
            </p>
          )}
        </div>
      </div>
      <p className="text-sm">
        {place.social.friendsBeen} accepted friends have been · {place.social.friendsSaved} accepted
        friends saved it
      </p>
      <p className="text-xs text-text-secondary">
        Only contributions visible to you are counted.{" "}
        {metrics
          ? `Activity computed ${new Date(metrics.computedAt).toLocaleString()}.`
          : "Public activity is unavailable for this place."}
      </p>
    </section>
  );
}
