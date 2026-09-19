import type { Place } from "@/lib/schemas";

function SignalChip({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-xs text-text-secondary">
      <span className="font-semibold text-text-primary">{label}</span>
      {value === null ? "Unknown" : `${value}%`}
    </span>
  );
}

export function AppealChip({ place }: { place: Pick<Place, "rarityAppeal"> }) {
  return <SignalChip label="Appeal" value={place.rarityAppeal} />;
}

export function FrequencyChip({ place }: { place: Pick<Place, "rarityDiscoveryFreq"> }) {
  return <SignalChip label="Frequency" value={place.rarityDiscoveryFreq} />;
}

export function WindowChip({ place }: { place: Pick<Place, "rarityAvailability"> }) {
  return <SignalChip label="Window" value={place.rarityAvailability} />;
}
