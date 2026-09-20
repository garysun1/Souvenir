import type { Place, PlanConstraints } from '@/domain/types';

/** Authored demo inputs, not directions, live hours, tickets, or accessibility advice. */
export const PLANNER_ORIGIN = 'downtown-origin';
export const PLANNER_ORIGIN_LABEL = 'Downtown Los Angeles · sample starting point';
export const PLANNING_SOURCE = 'Souvenir curated planning inputs · sample · Sep 19, 2026';
export const ARRIVAL_BUFFER_MINUTES = 10;
export const PLANNING_DATE_RANGE = { from: '2026-09-19', through: '2026-09-26' };

export interface TravelEstimate { minutes: number; costCents: number }
export type TravelMatrix = Record<PlanConstraints['transport'], Record<string, TravelEstimate>>;
export const travelKey = (from: string, to: string) => `${from}>${to}`;

// Explicit matrix values; deliberately NOT calculated from geographic distance.
const endpoints = [PLANNER_ORIGIN, 'la-the-broad', 'la-grand-park', 'la-moca', 'la-central-library', 'la-bradbury', 'la-janm', 'la-union-station', 'la-disney-hall', 'la-angels-flight', 'la-olvera'];
const walkingMinutes = [
  [0, 15, 18, 13, 10, 12, 24, 30, 16, 10, 29],
  [15, 0, 12, 5, 18, 15, 24, 28, 4, 10, 27],
  [18, 12, 0, 13, 25, 18, 20, 18, 10, 16, 17],
  [13, 5, 13, 0, 17, 12, 22, 27, 7, 8, 26],
  [10, 18, 25, 17, 0, 15, 28, 36, 21, 12, 35],
  [12, 15, 18, 12, 15, 0, 15, 23, 18, 7, 22],
  [24, 24, 20, 22, 28, 15, 0, 18, 26, 19, 17],
  [30, 28, 18, 27, 36, 23, 18, 0, 29, 28, 5],
  [16, 4, 10, 7, 21, 18, 26, 29, 0, 13, 28],
  [10, 10, 16, 8, 12, 7, 19, 28, 13, 0, 27],
  [29, 27, 17, 26, 35, 22, 17, 5, 28, 27, 0],
];
const transitMinutes = [
  [0, 12, 14, 11, 9, 10, 16, 18, 13, 9, 19],
  [12, 0, 10, 7, 12, 13, 17, 19, 6, 11, 20],
  [14, 10, 0, 11, 16, 14, 15, 13, 9, 13, 14],
  [11, 7, 11, 0, 12, 11, 16, 18, 8, 9, 19],
  [9, 12, 16, 12, 0, 11, 19, 22, 14, 10, 23],
  [10, 13, 14, 11, 11, 0, 12, 16, 15, 8, 17],
  [16, 17, 15, 16, 19, 12, 0, 14, 18, 14, 15],
  [18, 19, 13, 18, 22, 16, 14, 0, 20, 18, 7],
  [13, 6, 9, 8, 14, 15, 18, 20, 0, 12, 21],
  [9, 11, 13, 9, 10, 8, 14, 18, 12, 0, 19],
  [19, 20, 14, 19, 23, 17, 15, 7, 21, 19, 0],
];
export const sampleTravel: TravelMatrix = { walk: {}, transit: {} };
endpoints.forEach((from, row) => endpoints.forEach((to, column) => {
  if (from === to) return;
  sampleTravel.walk[travelKey(from, to)] = { minutes: walkingMinutes[row][column], costCents: 0 };
  // Each transit leg includes an authored wait/transfer estimate and a $1.75 fare.
  // No transfer discounts are assumed. There is no shared vehicle cost in these two modes.
  sampleTravel.transit[travelKey(from, to)] = { minutes: transitMinutes[row][column], costCents: 175 };
}));
export const travelCoveredPlaceIds = endpoints.filter(id => id !== PLANNER_ORIGIN);

export interface PlanningAccess {
  status: 'available' | 'unknown' | 'closed';
  stepFree: boolean | null;
  durationMinutes?: number;
  timedEntryMinutes?: number[];
  note: string;
  closedDates?: string[];
}
export const sampleAccess: Record<string, PlanningAccess> = Object.fromEntries(travelCoveredPlaceIds.map(id => [id, {
  status: 'available', stepFree: true,
  note: 'Sample public access assumed; verify official conditions before a real visit.',
}]));
sampleAccess['la-the-broad'] = {
  status: 'available', stepFree: true,
  timedEntryMinutes: [625, 685, 745, 805, 865, 925, 985, 1045],
  closedDates: ['2026-09-21'],
  note: 'Sample timed entry is assumed available at the displayed visit time. No ticket is held or booked.',
};
sampleAccess['la-grand-park'] = {
  status: 'available', stepFree: true, durationMinutes: 45,
  note: 'Sample outdoor park access; fountains and event access are not guaranteed.',
};
sampleAccess['la-bradbury'] = {
  status: 'available', stepFree: null,
  note: 'Sample public ground-floor visit only. Step-free access is unknown.',
};
sampleAccess['la-angels-flight'] = {
  status: 'available', stepFree: null,
  note: 'Sample $2 admission for this experience; service and step-free access are not live-checked.',
};
export const sampleVisitMinutes = (place: Place, access = sampleAccess) => access[place.id]?.durationMinutes ?? place.durationMinutes;
