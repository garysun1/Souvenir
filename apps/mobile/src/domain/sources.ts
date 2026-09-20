import type { EvidenceValue, Place, SourceStatus } from '@/domain/types';
import { categoryLabels, placeById } from '@/fixtures/catalog';
import { sourceById, type SourceDefinition, type SourceId } from '@/fixtures/sources';
import { planningWeather, PLANNER_TIMEZONE } from '@/fixtures/weather';
import { DEMO_CLOCK } from '@/state/seed';

export interface FactProvenance {
  recordId: string;
  providerRecordId: string | null;
  geographicScope: string;
  period: string;
  unit: string;
  observedAt: string | null;
  retrievedAt: string | null;
  explanation: string;
}
export interface SourceFact {
  id: string;
  label: string;
  sourceId: SourceId;
  evidence: EvidenceValue<string | number>;
  provenance: FactProvenance;
  /** Historical sample only; never a current operational claim. */
  previousSample?: string;
}
export interface FactContext { sourceStatus: SourceStatus; clock: string; rain?: boolean }

const notApplicable = (reason: string): EvidenceValue<never> => ({ status: 'not-applicable', reason });
const unknown = (reason: string): EvidenceValue<never> => ({ status: 'unknown', reason });

/** All destination values here come from local fixtures, not provider responses. */
export function factsForPlace(place: Place, context: FactContext): SourceFact[] {
  const base = (key: string, label: string, sourceId: SourceId, unit: string, explanation: string): SourceFact => ({
    id: `${place.id}:${key}`, label, sourceId,
    evidence: unknown('No source record has been retrieved.'),
    provenance: {
      recordId: `${sourceId}:${place.id}:${key}`, providerRecordId: null,
      geographicScope: `${place.name} · ${place.neighborhood}, Los Angeles`,
      period: 'No observation period recorded', unit, observedAt: null, retrievedAt: null, explanation,
    },
  });
  const sample = (key: string, label: string, value: string | number, unit: string, explanation: string, operational = false): SourceFact => {
    const fact = base(key, label, 'curated', unit, explanation);
    fact.provenance.period = 'Authored demo baseline · September 19, 2026';
    fact.provenance.observedAt = DEMO_CLOCK;
    fact.evidence = { status: 'known', value, mode: 'sample', sourceRecordId: fact.provenance.recordId, observedAt: DEMO_CLOCK };
    if (operational && context.sourceStatus !== 'sample') {
      fact.evidence = unknown(context.sourceStatus === 'stale'
        ? 'The sample source is stale. Current hours, prices and access have not been checked.'
        : 'Simulated unavailable source. No current operational data; your place and memories are still saved.');
      if (context.sourceStatus === 'stale') fact.previousSample = String(value);
    }
    return fact;
  };
  const hours = `${String(place.openHour).padStart(2, '0')}:00–${String(place.closeHour).padStart(2, '0')}:00`;
  const facts: SourceFact[] = [
    sample('identity', 'Place identity', `${place.name} · ${categoryLabels[place.category]}`, 'Place name / authored category',
      'A real destination represented in Souvenir’s authored catalog. This is not a retrieved OpenTripMap record or verification of current operations.'),
    sample('coordinates', 'Catalog coordinates', `${place.latitude}, ${place.longitude}`, 'WGS84 degrees (latitude, longitude)',
      'Bundled approximate coordinates. They are not a measured entrance location. Device-derived distance is an estimate; demo-origin distance must be labeled sample.'),
    sample('hours', 'Sample hours', hours, `Local time · ${PLANNER_TIMEZONE}`,
      'A simplified sample interval for planning, not weekday-specific published hours. This fact never establishes that a venue is currently open.', true),
    sample('price', 'Sample visit cost', place.priceCents / 100, 'USD per person',
      'Sample cost for the catalog visit only. Exterior or grounds access does not establish the price of exhibitions, performances, parking, tickets or other interior experiences.', true),
    sample('duration', 'Sample visit duration', place.durationMinutes, 'Minutes per visit',
      'An authored planning allowance, not a provider estimate or reservation duration.', true),
    sample('booking', 'Sample reservation note', place.bookingRequired ? 'Reservation may be needed — check the venue' : 'No reservation modeled — check the venue', 'Sample access note',
      'The booking flag is a fixture. Souvenir does not check ticket inventory, connect to a booking provider or make reservations.', true),
    sample('discovery', 'Demo discovery frequency', `${place.discoveryCount} of ${place.cohort}`, 'Fictional demo profiles',
      'A fixed sample cohort, not real visitor counts, unique people at a venue, popularity statistics or NPS visitation.'),
  ];
  const seasonal = base('seasonal', 'Seasonal / event access', 'curated', 'Start / end dates, local time',
    'There is no dated seasonal-access record in this catalog. No active-season claim can be made for the selected demo date.');
  seasonal.evidence = unknown('No published start/end dates are bundled. Seasonal and event access has not been checked.');
  facts.push(seasonal);

  const trip = base('provider-identity', 'OpenTripMap place record', 'opentripmap', 'Provider place ID and categories',
    'Provider context only. No OpenTripMap record ID or payload was retrieved; authored catalog fields are not attributed to this provider.');
  trip.evidence = unknown('No matching OpenTripMap snapshot is bundled. Use the authored catalog identity above.');
  facts.push(trip);

  const park = base('park-metadata', 'Municipal park metadata', 'la-parks', 'Dataset-specific park attributes',
    'No acreage, facilities or attendance may be inferred from a park label. City dataset coverage must be matched before reporting a fact.');
  park.evidence = place.category === 'park'
    ? unknown('No matched municipal park record is bundled. The park category does not establish the operator or dataset coverage.')
    : notApplicable('This catalog entry is not a municipal park record. Park-wide facts must not be substituted for building or landmark facts.');
  facts.push(park);

  const weather = base('weather', 'Weather planning scenario', 'open-meteo', 'Dry / rain scenario, not a measurement',
    'This is Souvenir’s bundled planning scenario, not an Open-Meteo forecast. Weather has not been checked.');
  weather.provenance.geographicScope = 'Downtown Los Angeles only; not a destination-level forecast';
  weather.provenance.period = 'September 19–26, 2026 · America/Los_Angeles';
  const date = localDemoDate(context.clock);
  const scenario = date ? planningWeather(date, context.rain ?? false, context.sourceStatus) : null;
  if (place.neighborhood !== 'Downtown') {
    weather.evidence = unknown('Weather not checked. The bundled Downtown LA scenario does not cover this destination.');
  } else if (!scenario || scenario.status === 'unknown') {
    weather.evidence = unknown(scenario?.label ?? 'Weather not checked. The demo clock is invalid.');
  } else {
    weather.evidence = { status: 'known', value: scenario.label, mode: 'sample', sourceRecordId: weather.provenance.recordId, observedAt: DEMO_CLOCK };
    weather.provenance.observedAt = DEMO_CLOCK;
  }
  facts.push(weather);

  const nps = base('nps-visitation', 'NPS visitation', 'nps', 'Recreation visits per reporting unit / year',
    'No NPS unit, reporting year or visitation count is assigned. Never borrow Yosemite or Santa Monica Mountains totals for this destination.');
  nps.provenance.geographicScope = 'No matching NPS reporting unit';
  nps.provenance.period = 'Not applicable';
  nps.evidence = notApplicable(`${place.name} is not a reporting National Park System unit. No NPS visitation count applies.`);
  facts.push(nps);
  return facts;
}

export function evidenceLabel(fact: SourceFact): string {
  switch (fact.evidence.status) {
    case 'known': return fact.evidence.mode === 'sample' ? 'Bundled sample' : 'Verified snapshot';
    case 'unknown': return fact.previousSample ? 'Stale sample · not checked' : 'No data';
    case 'not-applicable': return 'Not applicable';
  }
}

export function factValue(fact: SourceFact): string {
  if (fact.evidence.status === 'unknown') return fact.sourceId === 'open-meteo' ? 'Weather not checked' : 'Unknown';
  if (fact.evidence.status === 'not-applicable') return 'Not applicable';
  return typeof fact.evidence.value === 'number' && fact.provenance.unit === 'USD per person'
    ? `$${fact.evidence.value.toFixed(2)}` : String(fact.evidence.value);
}

export function sourceStatusLabel(source: SourceDefinition, status: SourceStatus): string {
  if (source.id === 'nps') return 'Not applicable';
  if (source.id === 'opentripmap' || source.id === 'la-parks') return 'Unavailable · no snapshot';
  if (status === 'unavailable') return 'Unavailable · simulated';
  if (status === 'stale') return 'Stale sample · not checked';
  return 'Bundled sample';
}

type QueryValue = string | string[] | undefined;
export type SourceQuery = { status: 'ready'; place?: Place; source?: SourceDefinition }
  | { status: 'unavailable'; reason: string };
export function resolveSourceQuery(params: { placeId?: QueryValue; sourceId?: QueryValue }): SourceQuery {
  if (Array.isArray(params.placeId) || Array.isArray(params.sourceId)) return { status: 'unavailable', reason: 'Choose one place and one source at a time.' };
  const place = params.placeId === undefined ? undefined : placeById(params.placeId);
  const source = params.sourceId === undefined ? undefined : sourceById(params.sourceId);
  if (params.placeId !== undefined && !place) return { status: 'unavailable', reason: 'This destination is not in the bundled catalog. Your saved memories have not been changed.' };
  if (params.sourceId !== undefined && !source) return { status: 'unavailable', reason: 'This source record is unavailable. You can still browse the catalog and your memories.' };
  return { status: 'ready', place, source };
}

function localParts(clock: string) {
  const date = new Date(clock);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PLANNER_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (key: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === key)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
}
export function localDemoDate(clock: string): string | null {
  const parts = localParts(clock);
  return parts ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` : null;
}
export function formatDemoClock(clock: string): string {
  if (!localParts(clock)) return 'Demo clock unavailable';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PLANNER_TIMEZONE, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(clock));
}
/** Advances a local calendar day, preserving wall time across normal DST changes. */
export function advanceDemoDay(clock: string): string {
  const parts = localParts(clock);
  if (!parts) throw new Error('The demo clock is invalid. Reset the demo to restore it.');
  const target = Date.UTC(parts.year, parts.month - 1, parts.day + 1, parts.hour, parts.minute, parts.second);
  let candidate = new Date(clock).getTime() + 24 * 60 * 60 * 1000;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = localParts(new Date(candidate).toISOString())!;
    const represented = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const difference = target - represented;
    if (difference === 0) return new Date(candidate).toISOString();
    candidate += difference;
  }
  // A skipped DST wall time cannot be preserved; use the next valid instant.
  return new Date(new Date(clock).getTime() + 24 * 60 * 60 * 1000).toISOString();
}
