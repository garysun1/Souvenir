import type { BoundingBox } from "../../../shared/api-contract";
import { coordinatesSchema } from "./types";

const alphabet = "0123456789bcdefghjkmnpqrstuvwxyz";
const radians = (value: number) => (value * Math.PI) / 180;
export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const h =
    Math.sin(radians(b.lat - a.lat) / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function radiusBounds(lat: number, lng: number, radiusM: number): BoundingBox {
  coordinatesSchema.parse({ lat, lng });
  if (!Number.isFinite(radiusM) || radiusM <= 0 || radiusM > 200000)
    throw new RangeError("Invalid radius.");
  const angular = radiusM / 6371000;
  const deltaLat = (angular * 180) / Math.PI;
  const south = Math.max(-90, lat - deltaLat);
  const north = Math.min(90, lat + deltaLat);
  if (south === -90 || north === 90) return { south, north, west: -180, east: 180 };
  const deltaLng =
    (Math.asin(Math.min(1, Math.sin(angular) / Math.cos(radians(lat)))) * 180) / Math.PI;
  const wrap = (value: number) => ((value + 540) % 360) - 180;
  return { south, north, west: wrap(lng - deltaLng), east: wrap(lng + deltaLng) };
}
export function splitBounds(box: BoundingBox): BoundingBox[] {
  return box.west <= box.east
    ? [box]
    : [
        { ...box, east: 180 },
        { ...box, west: -180 },
      ];
}
export function inBounds(point: { lat: number; lng: number }, box: BoundingBox): boolean {
  return (
    point.lat >= box.south &&
    point.lat <= box.north &&
    splitBounds(box).some((part) => point.lng >= part.west && point.lng <= part.east)
  );
}
export function geohash(lat: number, lng: number, precision = 6): string {
  coordinatesSchema.parse({ lat, lng });
  if (!Number.isInteger(precision) || precision < 1 || precision > 9)
    throw new RangeError("Invalid precision.");
  const ranges = [
    [-180, 180],
    [-90, 90],
  ];
  let output = "",
    value = 0;
  for (let bit = 0; bit < precision * 5; bit++) {
    const axis = bit % 2;
    const range = ranges[axis];
    const midpoint = (range[0] + range[1]) / 2;
    const high = (axis === 0 ? lng : lat) >= midpoint;
    value = value * 2 + Number(high);
    range[high ? 0 : 1] = midpoint;
    if (bit % 5 === 4) {
      output += alphabet[value];
      value = 0;
    }
  }
  return output;
}
export function cellBounds(hash: string): BoundingBox {
  if (!/^[0-9bcdefghjkmnpqrstuvwxyz]{5}$/.test(hash)) throw new RangeError("Invalid cell.");
  const ranges = [
    [-180, 180],
    [-90, 90],
  ];
  let bit = 0;
  for (const character of hash) {
    const value = alphabet.indexOf(character);
    for (let mask = 16; mask; mask >>= 1) {
      const range = ranges[bit++ % 2];
      range[value & mask ? 0 : 1] = (range[0] + range[1]) / 2;
    }
  }
  return { west: ranges[0][0], east: ranges[0][1], south: ranges[1][0], north: ranges[1][1] };
}
