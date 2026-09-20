import type { UserStatsDto } from "../../../shared/api-contract";

export function UserStats({ stats }: { stats: UserStatsDto | null }) {
  if (!stats)
    return (
      <p className="text-sm text-text-secondary">
        Statistics are unavailable or not shared with you.
      </p>
    );
  return (
    <section className="space-y-3" aria-label="Activity statistics">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ["Places visited", stats.placesVisited],
          ["Editions", stats.editions],
          ["Cities visited", stats.citiesVisited],
          ["Current streak", `${stats.currentStreakWeeks} weeks`],
          ["Longest streak", `${stats.longestStreakWeeks} weeks`],
          ["Global rank", stats.globalRank === null ? "Unknown" : `#${stats.globalRank}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-divider p-3 text-center">
            <p className="font-serif text-xl font-bold text-brand">{value}</p>
            <p className="text-xs text-text-secondary">{label}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-secondary">
        {stats.sampleStatus === "stale"
          ? "Stale statistics — refresh before comparing. "
          : stats.sampleStatus !== "ready"
            ? "Limited activity; unavailable ranks stay unknown. "
            : ""}
        Distinct places and UTC calendar-week streaks from visible Souvenir activity. Global rank
        uses public activity and shared statistics.
      </p>
      <h3 className="font-serif font-bold text-brand">City ranks</h3>
      {stats.cityRanks.length ? (
        <ul className="divide-y divide-divider">
          {stats.cityRanks.map((city) => (
            <li
              key={`${city.country}:${city.city}`}
              className="flex justify-between gap-3 py-2 text-sm"
            >
              <span>
                {city.city}, {city.country}
              </span>
              <span>
                #{city.rank} · {city.placesVisited} places
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-secondary">
          No eligible city rank yet. Unknown localities are excluded.
        </p>
      )}
      <p className="text-xs text-text-secondary">
        Computed {new Date(stats.computedAt).toLocaleString()}
      </p>
    </section>
  );
}
