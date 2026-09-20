export function countryName(code: string | null | undefined) {
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function destinationCities(places: { city?: string | null; country?: string | null }[]) {
  const cities = new Map<string, { city: string; country: string; label: string }>();
  for (const place of places) {
    if (!place.city || !place.country) continue;
    const country = place.country.toUpperCase();
    cities.set(JSON.stringify([place.city, country]), {
      city: place.city,
      country,
      label: `${place.city}, ${countryName(country)}`,
    });
  }
  return [...cities.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function directionsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
}
