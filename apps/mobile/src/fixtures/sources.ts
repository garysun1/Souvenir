export type SourceId = 'curated' | 'opentripmap' | 'la-parks' | 'open-meteo' | 'nps';

export interface SourceDefinition {
  id: SourceId;
  name: string;
  provider: string;
  description: string;
  scope: string;
  period: string;
  units: string;
  boundary: string;
  documentationUrl: string | null;
  bundledFile: string | null;
}

/** Provider descriptions are not evidence that any destination record was retrieved. */
export const sources: readonly SourceDefinition[] = [
  {
    id: 'curated', name: 'Souvenir curated catalog', provider: 'Souvenir prototype',
    description: 'Real Los Angeles destination names, with authored summaries, category mapping and deliberately sampled planning inputs.',
    scope: 'The bundled Los Angeles destination catalog; no live venue verification.',
    period: 'Demo baseline: September 19, 2026. This is a fixture date, not a retrieval date.',
    units: 'WGS84 degrees, USD, minutes, local hours and fictional demo profiles.',
    boundary: 'Hours, prices, booking flags and discovery counts are sample operations. A free grounds visit is not proof that a paid interior experience is free. Check the venue before a real visit.',
    documentationUrl: null, bundledFile: 'src/fixtures/catalog.ts',
  },
  {
    id: 'opentripmap', name: 'OpenTripMap', provider: 'OpenTripMap',
    description: 'A potential provider of place identity and category context. No OpenTripMap destination records are bundled or fetched by this demo.',
    scope: 'Points of interest; a provider record must be matched to an individual destination.',
    period: 'No destination observation or retrieval date recorded.',
    units: 'Place identifiers, categories and geographic coordinates.',
    boundary: 'A catalog name or coordinate is not a verified OpenTripMap snapshot. Place metadata is not a reliable current-hours or ticket feed.',
    documentationUrl: 'https://opentripmap.io/product', bundledFile: null,
  },
  {
    id: 'la-parks', name: 'LA parks open data', provider: 'City of Los Angeles / Recreation and Parks',
    description: 'A reference for applicable municipal park metadata. This demo has no retrieved park acreage, facility or attendance records.',
    scope: 'Applicable City of Los Angeles park records, not every park in LA County. State, county and other operators need their own source.',
    period: 'No park observation or retrieval date recorded.',
    units: 'Dataset-specific park attributes; no numerical measurements bundled.',
    boundary: 'The park category alone does not prove municipal ownership or a dataset match. Missing facts remain unknown, never zero.',
    documentationUrl: 'https://geohub.lacity.org/', bundledFile: null,
  },
  {
    id: 'open-meteo', name: 'Open-Meteo', provider: 'Open-Meteo',
    description: 'Weather API documentation alongside a locally authored dry/rain planning scenario. No forecast has been retrieved.',
    scope: 'The bundled planning scenario covers Downtown Los Angeles, not a destination-level forecast.',
    period: 'Sample planning window: September 19–26, 2026, America/Los_Angeles.',
    units: 'Dry/rain scenario only. No temperature or precipitation measurements bundled.',
    boundary: 'Weather not checked. A planning scenario is not a forecast or a safety advisory. Outside its date or geographic scope, the fact is unknown.',
    documentationUrl: 'https://open-meteo.com/en/docs', bundledFile: 'src/fixtures/weather.ts',
  },
  {
    id: 'nps', name: 'NPS visitation', provider: 'National Park Service',
    description: 'Visitor-use statistics apply only to an actual reporting National Park System unit. None of the bundled destinations is such a unit.',
    scope: 'Reporting NPS units only; no matching unit in this Los Angeles catalog.',
    period: 'Not applicable: no reporting year or unit selected.',
    units: 'Recreation visits per reporting unit and year, not unique people or individual-building attendance.',
    boundary: 'Do not transfer Yosemite or Santa Monica Mountains totals to a municipal park, museum or landmark. Not applicable is different from zero visits.',
    documentationUrl: 'https://www.nps.gov/subjects/socialscience/visitor-use-statistics-dashboard.htm', bundledFile: null,
  },
];

export function sourceById(id: string) {
  return sources.find(source => source.id === id);
}

export const fontCredits = [
  {
    name: 'Inter', author: 'Rasmus Andersson and the Inter Project Authors',
    license: 'SIL Open Font License 1.1', source: 'https://rsms.me/inter/',
    licenseUrl: 'https://github.com/rsms/inter/blob/master/LICENSE.txt',
    usage: 'Bundled functional typography, distributed through @expo-google-fonts/inter.',
  },
  {
    name: 'Playfair Display', author: 'Claus Eggers Sørensen and the Playfair Display Project Authors',
    license: 'SIL Open Font License 1.1', source: 'https://fonts.google.com/specimen/Playfair+Display',
    licenseUrl: 'https://github.com/google/fonts/blob/main/ofl/playfairdisplay/OFL.txt',
    usage: 'Bundled serif headings, distributed through @expo-google-fonts/playfair-display.',
  },
] as const;
