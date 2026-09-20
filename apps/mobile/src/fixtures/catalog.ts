import type { Category, Place, User } from '@/domain/types';

export const categoryLabels: Record<Category, string> = { park: 'Parks & outdoors', cultural: 'Culture', landmark: 'Landmarks', food: 'Food', hidden_gem: 'Hidden gems' };
type Row = [string, string, Category, string, number, number, number, string[], string];
const rows: Row[] = [
  ['la-griffith-park', 'Griffith Park', 'park', 'Los Feliz', 34.1366, -118.2942, 0, ['outdoors', 'scenic', 'hiking'], 'A little wilderness in the middle of everything. Find a trail, a view, and room to breathe.'],
  ['la-echo-park', 'Echo Park Lake', 'park', 'Echo Park', 34.0719, -118.2606, 0, ['outdoors', 'scenic', 'water'], 'Lotus flowers, swan boats, and a skyline that feels like a postcard.'],
  ['la-elysian-park', 'Elysian Park', 'park', 'Elysian Park', 34.082, -118.237, 0, ['quiet', 'outdoors', 'hiking'], 'Winding paths and eucalyptus shade above the city.'],
  ['la-grand-park', 'Grand Park', 'park', 'Downtown', 34.0558, -118.2456, 0, ['outdoors', 'garden', 'art'], 'A green ribbon through Downtown, with fountains, pink benches, and space to pause.'],
  ['la-state-historic-park', 'LA State Historic Park', 'park', 'Chinatown', 34.0689, -118.2308, 0, ['outdoors', 'scenic'], 'Open lawns and city views on a former rail yard, reimagined.'],
  ['la-barnsdall', 'Barnsdall Art Park', 'park', 'East Hollywood', 34.1002, -118.2947, 0, ['art', 'outdoors', 'architecture'], 'Hilltop gardens surrounding a piece of architectural history.'],
  ['la-macarthur', 'MacArthur Park', 'park', 'Westlake', 34.0595, -118.2788, 0, ['outdoors', 'water'], 'An urban lake surrounded by the energy of Westlake.'],
  ['la-rose-garden', 'Exposition Park Rose Garden', 'park', 'Exposition Park', 34.0168, -118.286, 0, ['quiet', 'garden', 'outdoors'], 'Slow down among the roses, brick paths, and fountains.'],
  ['la-lake-balboa', 'Lake Balboa Park', 'park', 'Van Nuys', 34.1804, -118.499, 0, ['outdoors', 'water'], 'An easy lakeside afternoon beneath the trees.'],
  ['la-vista-hermosa', 'Vista Hermosa Natural Park', 'park', 'Westlake', 34.0635, -118.2572, 0, ['quiet', 'scenic', 'outdoors'], 'A hidden hillside with one of the best seats in the city.'],
  ['la-the-broad', 'The Broad', 'cultural', 'Downtown', 34.0544, -118.2506, 0, ['art', 'indoors', 'architecture'], 'Big ideas, unexpected perspectives. Explore contemporary art inside an architectural work of art.'],
  ['la-moca', 'MOCA Grand Avenue', 'cultural', 'Downtown', 34.0534, -118.2504, 0, ['art', 'indoors', 'quiet'], 'A thoughtful collection of contemporary art in the heart of Downtown.'],
  ['la-janm', 'Japanese American National Museum', 'cultural', 'Little Tokyo', 34.0493, -118.2385, 1600, ['history', 'indoors', 'quiet'], 'Personal stories connecting generations of Japanese American life.'],
  ['la-central-library', 'Los Angeles Central Library', 'cultural', 'Downtown', 34.0505, -118.2552, 0, ['quiet', 'free', 'indoors', 'architecture'], 'More than a library. Discover painted ceilings, quiet corners, and stories around every turn.'],
  ['la-caam', 'California African American Museum', 'cultural', 'Exposition Park', 34.0159, -118.2834, 0, ['art', 'history', 'indoors'], 'Art and stories that celebrate African American culture.'],
  ['la-science-center', 'California Science Center', 'cultural', 'Exposition Park', 34.0156, -118.2862, 0, ['science', 'indoors'], 'An afternoon of curiosity, from tiny ecosystems to outer space.'],
  ['la-griffith-observatory', 'Griffith Observatory', 'cultural', 'Los Feliz', 34.1184, -118.3004, 0, ['science', 'scenic', 'indoors'], 'Look out over the city, then look a little further into the universe.'],
  ['la-autry', 'Autry Museum', 'cultural', 'Griffith Park', 34.1489, -118.2818, 1600, ['history', 'indoors', 'quiet'], 'Many voices, many stories of the American West.'],
  ['la-lacma', 'LACMA', 'cultural', 'Mid-Wilshire', 34.0639, -118.3592, 2500, ['art', 'indoors'], 'Art across places and time, and a familiar gathering of street lamps.'],
  ['la-getty', 'Getty Center', 'cultural', 'Brentwood', 34.078, -118.4741, 0, ['art', 'garden', 'indoors', 'quiet'], 'Art, architecture, and gardens high above Los Angeles.'],
  ['la-disney-hall', 'Walt Disney Concert Hall', 'landmark', 'Downtown', 34.0553, -118.2498, 0, ['architecture', 'outdoors'], 'Walk around the sweeping silver curves of a Los Angeles icon. Exterior visit.'],
  ['la-bradbury', 'Bradbury Building', 'landmark', 'Downtown', 34.0505, -118.2479, 0, ['architecture', 'indoors', 'history'], 'Sunlight, ironwork, and a little movie magic. Public ground-floor area only.'],
  ['la-angels-flight', 'Angels Flight', 'landmark', 'Downtown', 34.0516, -118.2506, 200, ['history', 'outdoors'], 'A tiny orange railway with a century of stories.'],
  ['la-union-station', 'Union Station', 'landmark', 'El Pueblo', 34.0561, -118.2365, 0, ['architecture', 'indoors', 'history'], 'Grand waiting rooms and garden courtyards at the gateway to the city.'],
  ['la-olvera', 'Olvera Street', 'landmark', 'El Pueblo', 34.0571, -118.2375, 0, ['history', 'outdoors'], 'A colorful stroll through one of the city’s oldest streets.'],
  ['la-watts-towers', 'Watts Towers', 'landmark', 'Watts', 33.9386, -118.2413, 0, ['art', 'outdoors'], 'A handmade mosaic of ambition, rising above Watts. Exterior visit.'],
  ['la-hollywood-walk', 'Hollywood Walk of Fame', 'landmark', 'Hollywood', 34.1016, -118.3267, 0, ['history', 'outdoors'], 'Find a favorite star along Hollywood Boulevard.'],
  ['la-venice-canals', 'Venice Canals', 'landmark', 'Venice', 33.9856, -118.4668, 0, ['quiet', 'outdoors', 'water'], 'Footbridges, still water, and a different rhythm of Los Angeles.'],
  ['la-hollywood-bowl', 'Hollywood Bowl', 'landmark', 'Hollywood Hills', 34.1122, -118.3392, 0, ['music', 'outdoors'], 'An iconic hillside amphitheater. Exterior grounds, subject to event access.'],
  ['la-korean-bell', 'Korean Bell of Friendship', 'landmark', 'San Pedro', 33.7093, -118.2937, 0, ['scenic', 'outdoors', 'history'], 'Ocean air and an intricately painted pavilion on a coastal bluff.'],
];
export const fixturePlaces: Place[] = rows.map(([id, name, category, neighborhood, latitude, longitude, priceCents, tags, summary], index) => ({
  id, name, category, neighborhood, latitude, longitude, priceCents, tags, summary,
  durationMinutes: category === 'cultural' ? 60 : 30,
  openHour: category === 'park' ? 6 : 10, closeHour: category === 'park' ? 20 : 18,
  discoveryCount: 12 + (index * 7) % 67, cohort: 100,
  sourceIds: ['curated', 'opentripmap', ...(category === 'park' ? ['la-parks'] : [])],
  bookingRequired: id === 'la-the-broad' || id === 'la-getty',
}));
export let places = fixturePlaces;
export const placeById = (id: string) => places.find(place => place.id === id);
export interface CatalogSet { id: string; title: string; description: string; placeIds: string[] }
const fixtureSet = { id: 'downtown-firsts', title: 'Downtown Firsts', description: 'Three places. A whole new side of your city.', placeIds: ['la-central-library', 'la-the-broad', 'la-grand-park'] };
export let downtownSet: CatalogSet = fixtureSet;
export let sets: CatalogSet[] = [fixtureSet];
const fixtureUsers: User[] = [
  { id: 'you', name: 'You', initials: 'Y', color: '#D5E3DC', tastes: ['cultural', 'park'] },
  { id: 'maya', name: 'Maya', initials: 'M', color: '#EACCB8', tastes: ['cultural', 'park'] },
  { id: 'jordan', name: 'Jordan', initials: 'J', color: '#DAD8ED', tastes: ['landmark', 'park'] },
  { id: 'sam', name: 'Sam', initials: 'S', color: '#E5DBB3', tastes: ['cultural', 'landmark'] },
];
export let users = fixtureUsers;
export function restoreFixtureCatalog() { places = fixturePlaces; sets = [fixtureSet]; downtownSet = fixtureSet; users = fixtureUsers; }
export function installCatalog(catalog: Place[], collections: CatalogSet[], people: User[]) {
  places = catalog; sets = collections; users = people;
  downtownSet = collections.find(set => set.title === 'Downtown Firsts') ?? { id: '', title: 'Sets', description: 'No sets available.', placeIds: [] };
}
export function mergeCatalog(incoming: Place[]) {
  const merged = new Map(places.map(place => [place.id, place]));
  for (const place of incoming) merged.set(place.id, place);
  places = [...merged.values()];
}
