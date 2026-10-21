import type { Coordinates, TransportMode } from '@travel/shared';

/**
 * Маршрут по дорогам через OSRM.
 * Демо-сервер router.project-osrm.org отвечает на foot и bike тем же автомобильным графом,
 * поэтому пеший и велосипедный профили по умолчанию идут на routing.openstreetmap.de.
 * OSRM_URL подменяет все три адреса — так подключается свой инстанс со всеми профилями.
 * Публичные серверы только для локальной разработки, не для прод-нагрузки.
 */

const USER_AGENT = process.env.OSRM_USER_AGENT ?? 'AI-Travel-Planner/0.1 (local development)';
const REQUEST_TIMEOUT_MS = 4_000;

export type OsrmProfile = 'foot' | 'bike' | 'driving';

const DEFAULT_URLS: Record<OsrmProfile, string> = {
  driving: 'https://router.project-osrm.org',
  foot: 'https://routing.openstreetmap.de/routed-foot',
  bike: 'https://routing.openstreetmap.de/routed-bike',
};

function baseUrl(profile: OsrmProfile): string {
  const url = process.env.OSRM_URL || DEFAULT_URLS[profile];
  return url.replace(/\/$/, '');
}

const ROAD_PROFILES: Partial<Record<TransportMode, OsrmProfile>> = {
  walk: 'foot',
  bike: 'bike',
  car: 'driving',
  taxi: 'driving',
  bus: 'driving',
};

/** Профиль OSRM для транспорта. Метро, поезд, паром и самолёт по дорогам не строятся. */
export function roadProfile(transport: TransportMode): OsrmProfile | null {
  return ROAD_PROFILES[transport] ?? null;
}

export interface RoadLeg {
  distanceKm: number;
  durationMin: number;
  /** Пустой массив — плечо без линии, вызывающий код оставляет прямую. */
  geometry: Coordinates[];
}

interface OsrmStep {
  geometry?: { coordinates?: [number, number][] };
}

interface OsrmLeg {
  distance: number;
  duration: number;
  steps?: OsrmStep[];
}

interface OsrmResponse {
  code?: string;
  routes?: { legs?: OsrmLeg[] }[];
}

const cache = new Map<string, RoadLeg[]>();

function cacheKey(profile: OsrmProfile, points: Coordinates[]): string {
  const coords = points.map((point) => `${point.lng.toFixed(5)},${point.lat.toFixed(5)}`).join(';');
  return `${profile}|${coords}`;
}

function stepLine(steps: OsrmStep[] | undefined): Coordinates[] {
  const line: Coordinates[] = [];
  for (const step of steps ?? []) {
    for (const pair of step.geometry?.coordinates ?? []) {
      const lng = pair[0];
      const lat = pair[1];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const last = line[line.length - 1];
      if (last && last.lat === lat && last.lng === lng) continue;
      line.push({ lat, lng });
    }
  }
  return line;
}

/** Доводит линию до остановок, чтобы она сходилась с маркерами, а не только с привязкой к дороге. */
function withStops(from: Coordinates, to: Coordinates, line: Coordinates[]): Coordinates[] {
  const geometry = [...line];
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  if (!first || first.lat !== from.lat || first.lng !== from.lng) geometry.unshift(from);
  if (!last || last.lat !== to.lat || last.lng !== to.lng) geometry.push(to);
  return geometry;
}

function toRoadLegs(points: Coordinates[], legs: OsrmLeg[]): RoadLeg[] | null {
  if (legs.length !== points.length - 1) return null;
  return legs.map((leg, index) => {
    const line = stepLine(leg.steps);
    const from = points[index]!;
    const to = points[index + 1]!;
    return {
      distanceKm: Math.round((leg.distance / 1000) * 100) / 100,
      durationMin: Math.round(leg.duration / 60),
      geometry: line.length > 1 ? withStops(from, to, line) : [],
    };
  });
}

/**
 * Путь по дорогам через точки в заданном порядке.
 * Длина результата на единицу меньше числа точек. null — сервис недоступен или маршрут не найден.
 */
export async function routeLegs(profile: OsrmProfile, points: Coordinates[]): Promise<RoadLeg[] | null> {
  if (points.length < 2) return [];

  const key = cacheKey(profile, points);
  const cached = cache.get(key);
  if (cached) return cached;

  const coordPath = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = `${baseUrl(profile)}/route/v1/${profile}/${coordPath}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[osrm] ${profile}: HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as OsrmResponse;
    const legs = body.routes?.[0]?.legs;
    if (body.code !== 'Ok' || !legs) {
      console.warn(`[osrm] ${profile}: ${body.code ?? 'пустой ответ'}`);
      return null;
    }
    const road = toRoadLegs(points, legs);
    if (!road) {
      console.warn(`[osrm] ${profile}: плеч ${legs.length}, ожидалось ${points.length - 1}`);
      return null;
    }
    cache.set(key, road);
    return road;
  } catch (err) {
    console.warn(`[osrm] ${profile}: ${(err as Error).message}`);
    return null;
  }
}
