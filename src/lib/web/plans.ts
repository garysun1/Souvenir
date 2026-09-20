import type { PlaceDto, PlanCreate } from "../../../shared/api-contract";

export function samplePlan(
  userId: string,
  requestId: string,
  title: string,
  date: string,
  selectedIds: string[],
  catalog: PlaceDto[],
): PlanCreate {
  const places = selectedIds.map((id) => catalog.find((place) => place.id === id));
  if (
    !places.length ||
    places.length > 6 ||
    new Set(selectedIds).size !== selectedIds.length ||
    places.some((place) => !place)
  ) {
    throw new Error("Choose one to six different places from the shared catalog.");
  }
  const stops = selectedIds.map((placeId, index) => ({
    placeId,
    arrivalMinute: 840 + index * 60,
    departureMinute: 885 + index * 60,
    costCents: 0,
    travelMinutes: index === 0 ? 0 : 15,
  }));
  return {
    requestId,
    wishlistId: null,
    plan: {
      title: title.trim(),
      version: 1,
      provenance: "simulation",
      constraints: {
        participantIds: [userId],
        date,
        startMinute: 840,
        endMinute: 1200,
        budgetCents: 0,
        transport: "walk",
        interests: [...new Set(places.flatMap((place) => (place ? [place.category] : [])))],
        rain: false,
        excludedPlaceIds: [],
        preferredPlaceIds: selectedIds,
      },
      stops,
      totalCostCents: 0,
      totalMinutes: stops[stops.length - 1].departureMinute - 840,
      checks: [
        "Simulation: times and travel are placeholders. Costs, opening hours, weather and accessibility have not been checked. No booking is made.",
      ],
    },
  };
}

export function minuteLabel(minute: number) {
  return `${Math.floor(minute / 60)
    .toString()
    .padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
}
