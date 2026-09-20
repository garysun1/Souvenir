import { advanceDemoDay, evidenceLabel, factsForPlace, factValue, formatDemoClock, localDemoDate, resolveSourceQuery, sourceStatusLabel } from '@/domain/sources';
import type { SourceStatus } from '@/domain/types';
import { placeById, places } from '@/fixtures/catalog';
import { fontCredits, sourceById, sources } from '@/fixtures/sources';
import { reducer } from '@/state/reducer';
import { createSeed, DEMO_CLOCK } from '@/state/seed';

const broad = placeById('la-the-broad')!;
const park = placeById('la-grand-park')!;
const context = { sourceStatus: 'sample' as const, clock: DEMO_CLOCK };
const modes: SourceStatus[] = ['sample', 'stale', 'unavailable'];
const fact = (suffix: string, mode: SourceStatus = 'sample') => factsForPlace(broad, { ...context, sourceStatus: mode }).find(item => item.id.endsWith(`:${suffix}`))!;

describe('source registry and record integrity', () => {
  test('every catalog source reference resolves and all five source boundaries are present', () => {
    expect(sources.map(source => source.id).sort()).toEqual(['curated', 'la-parks', 'nps', 'open-meteo', 'opentripmap']);
    expect(new Set(sources.map(source => source.id)).size).toBe(sources.length);
    for (const place of places) for (const id of place.sourceIds) expect(sourceById(id)).toBeDefined();
    for (const source of sources) {
      expect(source.provider).not.toBe(''); expect(source.scope).not.toBe(''); expect(source.period).not.toBe('');
      expect(source.units).not.toBe(''); expect(source.boundary).not.toBe('');
      if (source.id !== 'curated') expect(source.documentationUrl).toMatch(/^https:\/\//);
      else expect(source.bundledFile).toBe('src/fixtures/catalog.ts');
    }
  });
  test('known values have unique linked local records, units and sample dates, not fabricated retrievals', () => {
    const records = places.flatMap(place => factsForPlace(place, context));
    expect(new Set(records.map(item => item.provenance.recordId)).size).toBe(records.length);
    for (const item of records) {
      expect(sourceById(item.sourceId)).toBeDefined();
      expect(item.provenance.unit).not.toBe('');
      expect(item.provenance.geographicScope).not.toBe('');
      expect(item.provenance.providerRecordId).toBeNull();
      expect(item.provenance.retrievedAt).toBeNull();
      if (item.evidence.status === 'known') {
        expect(item.evidence.mode).toBe('sample');
        expect(item.evidence.sourceRecordId).toBe(item.provenance.recordId);
        expect(item.evidence.observedAt).toBe(item.provenance.observedAt);
        expect(evidenceLabel(item)).toBe('Bundled sample');
      }
    }
  });
  test('provider documentation never masquerades as a destination snapshot', () => {
    for (const place of places) {
      const trip = factsForPlace(place, context).find(item => item.sourceId === 'opentripmap')!;
      expect(trip.evidence.status).toBe('unknown');
      expect(trip.provenance.retrievedAt).toBeNull();
      expect(trip.provenance.providerRecordId).toBeNull();
    }
    expect(fact('identity').sourceId).toBe('curated');
    expect(fact('hours').sourceId).toBe('curated');
    expect(fact('booking').sourceId).toBe('curated');
  });
  test('font credits preserve open-license references', () => {
    expect(fontCredits.map(font => font.name)).toEqual(['Inter', 'Playfair Display']);
    for (const font of fontCredits) {
      expect(font.license).toBe('SIL Open Font License 1.1');
      expect(font.author).not.toBe(''); expect(font.licenseUrl).toMatch(/^https:\/\//);
    }
  });
});

describe('known, unknown and not-applicable stay distinct', () => {
  test.each(modes)('no NPS count applies to any LA catalog destination in %s mode', sourceStatus => {
    for (const place of places) {
      const item = factsForPlace(place, { ...context, sourceStatus }).find(record => record.sourceId === 'nps')!;
      expect(item.evidence.status).toBe('not-applicable');
      expect(item.evidence).not.toHaveProperty('value');
      expect(factValue(item)).toBe('Not applicable');
      expect(item.provenance.period).toBe('Not applicable');
    }
    expect(sourceStatusLabel(sourceById('nps')!, sourceStatus)).toBe('Not applicable');
  });
  test('municipal metadata is unknown for a park without a matched record, not invented from its category', () => {
    const item = factsForPlace(park, context).find(record => record.sourceId === 'la-parks')!;
    expect(item.evidence.status).toBe('unknown');
    expect(item.evidence).not.toHaveProperty('value');
    expect(factValue(item)).toBe('Unknown');
    expect(fact('park-metadata').evidence.status).toBe('not-applicable');
  });
  test('a sampled zero-dollar cost is distinguishable from missing pricing', () => {
    expect(factValue(fact('price'))).toBe('$0.00');
    expect(fact('price').evidence.status).toBe('known');
    expect(factValue(fact('price', 'unavailable'))).toBe('Unknown');
    expect(fact('price', 'unavailable').evidence).not.toHaveProperty('value');
  });
  test.each(['hours', 'price', 'duration', 'booking'])('%s becomes unknown when stale; the old sample is explicitly separate', suffix => {
    const stale = fact(suffix, 'stale');
    expect(stale.evidence.status).toBe('unknown');
    expect(stale.evidence).not.toHaveProperty('value');
    expect(stale.previousSample).toBeDefined();
    expect(evidenceLabel(stale)).toBe('Stale sample · not checked');
    const unavailable = fact(suffix, 'unavailable');
    expect(unavailable.evidence.status).toBe('unknown');
    expect(unavailable.previousSample).toBeUndefined();
  });
  test('missing provider records do not remove catalog identity and unknown season windows do not become active', () => {
    for (const sourceStatus of modes) {
      expect(fact('identity', sourceStatus).evidence.status).toBe('known');
      expect(fact('coordinates', sourceStatus).evidence.status).toBe('known');
      expect(fact('seasonal', sourceStatus).evidence.status).toBe('unknown');
    }
  });
  test('discovery frequency is fictional profiles, not annual visitation', () => {
    const item = fact('discovery');
    expect(item.evidence).toMatchObject({ status: 'known', value: `${broad.discoveryCount} of ${broad.cohort}`, mode: 'sample' });
    expect(item.provenance.unit).toBe('Fictional demo profiles');
    expect(item.sourceId).toBe('curated');
  });
  test('reading facts on another demo day does not change their observation date', () => {
    const next = factsForPlace(broad, { ...context, clock: advanceDemoDay(DEMO_CLOCK) }).find(item => item.id === fact('hours').id)!;
    expect(next.provenance.observedAt).toBe(DEMO_CLOCK);
    expect(next.provenance.retrievedAt).toBeNull();
  });
});

describe('weather scope and freshness', () => {
  test('only an explicitly labeled local scenario is known, without a forecast measurement', () => {
    expect(fact('weather').evidence).toMatchObject({ status: 'known', mode: 'sample' });
    expect(factValue(fact('weather'))).toContain('no live forecast');
    const wet = factsForPlace(broad, { ...context, rain: true }).find(item => item.sourceId === 'open-meteo')!;
    expect(factValue(wet)).toContain('Sample rain');
    expect(wet.provenance.unit).toContain('not a measurement');
  });
  test.each(['stale', 'unavailable'] as SourceStatus[])('%s weather is not checked', sourceStatus => {
    const item = fact('weather', sourceStatus);
    expect(item.evidence.status).toBe('unknown');
    expect(factValue(item)).toBe('Weather not checked');
  });
  test('weather outside Downtown scope and outside the sample date range stays unknown', () => {
    const echo = factsForPlace(placeById('la-echo-park')!, context).find(item => item.sourceId === 'open-meteo')!;
    expect(echo.evidence.status).toBe('unknown');
    for (const clock of ['2026-09-18T21:00:00Z', '2026-09-27T21:00:00Z', 'invalid']) {
      const item = factsForPlace(broad, { ...context, clock }).find(record => record.sourceId === 'open-meteo')!;
      expect(item.evidence.status).toBe('unknown');
    }
  });
  test('coverage uses the Los Angeles day, not the UTC date', () => {
    const inside = factsForPlace(broad, { ...context, clock: '2026-09-27T01:00:00Z' }).find(item => item.sourceId === 'open-meteo')!;
    expect(inside.evidence.status).toBe('known');
    const outside = factsForPlace(broad, { ...context, clock: '2026-09-19T01:00:00Z' }).find(item => item.sourceId === 'open-meteo')!;
    expect(outside.evidence.status).toBe('unknown');
  });
});

describe('source deep links and demo settings', () => {
  test('optional source and destination query resolve independently or together', () => {
    expect(resolveSourceQuery({})).toEqual({ status: 'ready', place: undefined, source: undefined });
    expect(resolveSourceQuery({ placeId: broad.id })).toMatchObject({ status: 'ready', place: broad });
    expect(resolveSourceQuery({ sourceId: 'nps' })).toMatchObject({ status: 'ready', source: sourceById('nps') });
    expect(resolveSourceQuery({ placeId: broad.id, sourceId: 'curated' })).toMatchObject({ status: 'ready', place: broad, source: sourceById('curated') });
  });
  test.each([{ placeId: 'deleted-place' }, { sourceId: 'removed-source' }, { placeId: '' }, { sourceId: '' }, { placeId: ['a', 'b'] }, { sourceId: ['nps', 'curated'] }])('invalid query %j produces a recoverable unavailable view', query => {
    expect(resolveSourceQuery(query).status).toBe('unavailable');
  });
  test('advance day persists via the shared reducer without rewriting visits or plans', () => {
    const before = createSeed();
    const after = reducer(before, { type: 'CLOCK', clock: advanceDemoDay(before.clock) });
    expect(after.clock).toBe('2026-09-20T21:00:00.000Z');
    expect(localDemoDate(after.clock)).toBe('2026-09-20');
    expect(formatDemoClock(before.clock)).toContain('2:00 PM');
    expect(after.editions).toBe(before.editions); expect(after.plans).toBe(before.plans);
  });
  test('advancing a calendar day preserves the afternoon across daylight-saving boundaries', () => {
    expect(advanceDemoDay('2026-10-31T21:00:00.000Z')).toBe('2026-11-01T22:00:00.000Z');
    expect(advanceDemoDay('2026-03-07T22:00:00.000Z')).toBe('2026-03-08T21:00:00.000Z');
    expect(advanceDemoDay('2026-12-31T22:00:00.000Z')).toBe('2027-01-01T22:00:00.000Z');
  });
  test('an invalid clock is displayed honestly and cannot be advanced silently', () => {
    expect(formatDemoClock('invalid')).toBe('Demo clock unavailable');
    expect(localDemoDate('invalid')).toBeNull();
    expect(() => advanceDemoDay('invalid')).toThrow('clock is invalid');
  });
  test('failure controls share preferences and never delete user data', () => {
    const before = createSeed();
    const after = reducer(before, { type: 'PREFERENCES', patch: { sourceStatus: 'unavailable', identifyFailure: true, reducedMotion: true, offline: true } });
    expect(after.preferences).toMatchObject({ sourceStatus: 'unavailable', identifyFailure: true, reducedMotion: true, offline: true });
    expect(after.editions).toBe(before.editions); expect(after.wishlists).toBe(before.wishlists);
    expect(factsForPlace(broad, { sourceStatus: after.preferences.sourceStatus, clock: after.clock }).find(item => item.id.endsWith(':hours'))?.evidence.status).toBe('unknown');
  });
  test('confirmed reset actions restore the correct local sample or empty seed', () => {
    const changed = reducer(createSeed(), { type: 'PREFERENCES', patch: { sourceStatus: 'stale', offline: true, reducedMotion: true, identifyFailure: true } });
    const empty = reducer(changed, { type: 'RESET', mode: 'empty' });
    expect(empty).toEqual(createSeed('empty'));
    expect(empty.editions).toEqual([]); expect(empty.plans).toEqual([]);
    expect(empty.wishlists.find(list => list.id === 'saturday-maya')?.entries.some(entry => entry.saverIds.includes('maya'))).toBe(true);
    const sample = reducer(empty, { type: 'RESET', mode: 'sample' });
    expect(sample.editions.filter(edition => edition.ownerId === 'you')).toHaveLength(7);
    expect(new Set(sample.editions.filter(edition => edition.ownerId === 'you').map(edition => edition.placeId)).size).toBe(6);
    expect(sample.clock).toBe(DEMO_CLOCK); expect(sample.preferences.sourceStatus).toBe('sample');
    expect(places.length).toBeGreaterThanOrEqual(30);
  });
});
