import type { Coordinates, MapBounds } from '@/domain/search';

export const LA_BOUNDS: MapBounds = { north: 34.22, south: 33.67, east: -118.12, west: -118.58 };
export function fitMapBounds(points: Coordinates[]): MapBounds {
  if (!points.length) return LA_BOUNDS;
  const north = Math.max(...points.map(point => point.latitude));
  const south = Math.min(...points.map(point => point.latitude));
  const west = Math.min(...points.map(point => point.longitude));
  const east = Math.max(...points.map(point => point.longitude));
  const latitudePadding = Math.max((north - south) * .2, .015);
  const longitudePadding = Math.max((east - west) * .2, .015);
  return { north: north + latitudePadding, south: south - latitudePadding, west: west - longitudePadding, east: east + longitudePadding };
}
export function projectPoint(point: Coordinates, bounds: MapBounds, width: number, height: number) {
  return { x: (point.longitude - bounds.west) / (bounds.east - bounds.west) * width, y: (bounds.north - point.latitude) / (bounds.north - bounds.south) * height };
}
export function viewportBounds(bounds: MapBounds, width: number, height: number, zoom: number, pan: { x: number; y: number }): MapBounds {
  const centerX = width / 2 - pan.x / zoom;
  const centerY = height / 2 - pan.y / zoom;
  const longitude = (x: number) => bounds.west + (x / width) * (bounds.east - bounds.west);
  const latitude = (y: number) => bounds.north - (y / height) * (bounds.north - bounds.south);
  return { west: longitude(centerX - width / (2 * zoom)), east: longitude(centerX + width / (2 * zoom)), north: latitude(centerY - height / (2 * zoom)), south: latitude(centerY + height / (2 * zoom)) };
}
export function clusterPoints<T extends { x: number; y: number }>(points: T[], threshold: number): T[][] {
  const remaining = [...points];
  const groups: T[][] = [];
  while (remaining.length) {
    const head = remaining.shift()!;
    const group = [head];
    for (let index = remaining.length - 1; index >= 0; index--) if (Math.hypot(remaining[index].x - head.x, remaining[index].y - head.y) < threshold) group.push(...remaining.splice(index, 1));
    groups.push(group);
  }
  return groups;
}
