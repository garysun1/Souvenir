import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const destination = fileURLToPath(new URL('../assets/places/', import.meta.url));
const inventory = [
  ['la-griffith-park', 'Griffith Park'],
  ['la-echo-park', 'Echo Park'],
  ['la-elysian-park', 'Elysian Park, Los Angeles'],
  ['la-grand-park', 'Grand Park'],
  ['la-state-historic-park', 'Los Angeles State Historic Park'],
  ['la-barnsdall', 'Barnsdall Art Park'],
  ['la-macarthur', 'MacArthur Park'],
  ['la-rose-garden', 'Exposition Park Rose Garden'],
  ['la-lake-balboa', 'Lake Balboa, Los Angeles'],
  ['la-vista-hermosa', 'Vista Hermosa Natural Park'],
  ['la-the-broad', 'The Broad'],
  ['la-moca', 'Museum of Contemporary Art, Los Angeles'],
  ['la-janm', 'Japanese American National Museum'],
  ['la-central-library', 'Los Angeles Central Library'],
  ['la-caam', 'California African American Museum'],
  ['la-science-center', 'California Science Center'],
  ['la-griffith-observatory', 'Griffith Observatory'],
  ['la-autry', 'Autry Museum of the American West'],
  ['la-lacma', 'Los Angeles County Museum of Art'],
  ['la-getty', 'Getty Center'],
  ['la-disney-hall', 'Walt Disney Concert Hall'],
  ['la-bradbury', 'Bradbury Building'],
  ['la-angels-flight', 'Angels Flight'],
  ['la-union-station', 'Union Station (Los Angeles)'],
  ['la-olvera', 'Olvera Street'],
  ['la-watts-towers', 'Watts Towers'],
  ['la-hollywood-walk', 'Hollywood Walk of Fame'],
  ['la-venice-canals', 'Venice Canal Historic District'],
  ['la-hollywood-bowl', 'Hollywood Bowl'],
  ['la-korean-bell', 'Korean Bell of Friendship'],
];
const headers = { 'User-Agent': 'SouvenirPrototype/1.0 (educational local prototype; image attribution retained)' };
const clean = (value = '') => value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&');
async function get(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}
await mkdir(destination, { recursive: true });
const pageQuery = new URLSearchParams({ action: 'query', format: 'json', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '960', titles: inventory.map(([, title]) => title).join('|') });
const pageResult = await (await get(`https://en.wikipedia.org/w/api.php?${pageQuery}`)).json();
const pages = Object.values(pageResult.query.pages);
const imageTitles = pages.filter(page => page.thumbnail).map(page => `File:${decodeURIComponent(page.thumbnail.source.split('/').at(-2))}`);
const licenseQuery = new URLSearchParams({ action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'extmetadata', titles: imageTitles.join('|') });
const licenseResult = await (await get(`https://commons.wikimedia.org/w/api.php?${licenseQuery}`)).json();
const licensePages = Object.values(licenseResult.query.pages);
const credits = [];
for (let offset = 0; offset < inventory.length; offset += 3) {
  await Promise.all(inventory.slice(offset, offset + 3).map(async ([id, title]) => {
    try {
      const page = pages.find(item => item.title === title);
      if (!page?.thumbnail) throw new Error('No thumbnail');
      const thumbnail = page.thumbnail.source;
      const filename = decodeURIComponent(thumbnail.split('/').at(-2));
      const info = licensePages.find(item => item.title === `File:${filename.replaceAll('_', ' ')}`)?.imageinfo?.[0]?.extmetadata;
      if (!info?.LicenseShortName) throw new Error('No verifiable license');
      const license = info.LicenseShortName.value;
      if (!/CC|Public domain|CC0|GFDL/.test(license)) throw new Error(`Unsupported license: ${license}`);
      let image;
      try { image = await get(thumbnail.replace(/\/\d+px-/, '/960px-')); }
      catch { image = await get(thumbnail); }
      await writeFile(`${destination}${id}.jpg`, Buffer.from(await image.arrayBuffer()));
      credits.push({ id, title, file: `${id}.jpg`, author: clean(info.Artist?.value), license, licenseUrl: info.LicenseUrl?.value ?? '', source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`, original: thumbnail, modifications: 'Unmodified downloaded thumbnail; cropped only for display' });
      console.log(`Downloaded ${id} (${license})`);
    } catch (error) {
      console.error(`FAILED ${id}: ${error.message}`);
    }
  }));
}
credits.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(`${destination}credits.json`, JSON.stringify(credits, null, 2) + '\n');
await writeFile(new URL('../src/fixtures/images.ts', import.meta.url), "import type { ImageSourcePropType } from 'react-native';\nexport const placeImages: Record<string, ImageSourcePropType> = {\n" + credits.map(item => `  '${item.id}': require('../../assets/places/${item.file}'),`).join('\n') + '\n};\n');
console.log(`${credits.length}/${inventory.length} attributed images downloaded.`);
