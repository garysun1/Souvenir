import type { SourceStatus } from '@/domain/types';
import { PLANNING_DATE_RANGE } from './travel';

export const PLANNER_TIMEZONE = 'America/Los_Angeles';
export const WEATHER_SOURCE = 'Bundled sample weather scenario · Downtown LA · Sep 19–26, 2026';
export type PlanningWeather = { status: 'known'; rain: boolean; label: string } | { status: 'unknown'; label: string };
export function planningWeather(date: string, rain: boolean, sourceStatus: SourceStatus): PlanningWeather {
  if (sourceStatus === 'unavailable') return { status: 'unknown', label: 'Weather not checked — sample source unavailable.' };
  if (sourceStatus === 'stale') return { status: 'unknown', label: 'Weather not checked — source is stale.' };
  if (date < PLANNING_DATE_RANGE.from || date > PLANNING_DATE_RANGE.through) {
    return { status: 'unknown', label: 'No sample weather coverage for this date. Choose Sep 19–26, 2026.' };
  }
  return { status: 'known', rain, label: rain ? 'Sample rain · indoor visits only; transfers may be outdoors.' : 'Sample dry afternoon · no live forecast checked.' };
}
