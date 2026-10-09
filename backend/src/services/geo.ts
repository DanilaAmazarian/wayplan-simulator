import type { Coordinates } from '@travel/shared';

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Расстояние по большому кругу (формула гаверсинусов), км. */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Упорядочивает точки жадным алгоритмом ближайшего соседа.
 * Первая точка остаётся стартовой, каждая следующая — ближайшая из непосещённых.
 */
export function nearestNeighborOrder<T>(points: T[], getCoords: (p: T) => Coordinates): T[] {
  if (points.length <= 2) return [...points];

  const remaining = points.slice(1);
  const ordered: T[] = [points[0]!];

  while (remaining.length > 0) {
    const current = getCoords(ordered[ordered.length - 1]!);
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((p, i) => {
      const d = haversineKm(current, getCoords(p));
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    ordered.push(remaining.splice(bestIdx, 1)[0]!);
  }

  return ordered;
}
