import type { Coordinates } from '@travel/shared';
import { haversineKm } from './geo.js';
import type { GeneratedItinerary } from './openai.js';

/**
 * Геокодер OpenStreetMap Nominatim.
 * Политика публичного API: не более 1 запроса в секунду, осмысленный User-Agent, кэширование результатов.
 * https://operations.osmfoundation.org/policies/nominatim/
 */

const BASE_URL = process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ?? 'AI-Travel-Planner/0.1 (local development)';
const MIN_INTERVAL_MS = 1000;
const REQUEST_TIMEOUT_MS = 10_000;
/** Точка дальше этого расстояния от центра города считается ошибочным совпадением. */
const MAX_DISTANCE_FROM_CITY_KM = 50;

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name: string;
  /** [south, north, west, east] */
  boundingbox: [string, string, string, string];
}

interface GeoResult {
  coordinates: Coordinates;
  displayName: string;
  boundingBox: [number, number, number, number];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const cache = new Map<string, GeoResult | null>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

/** Глобальная очередь: запросы выполняются строго последовательно с паузой ≥ 1 с. */
function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastRequestAt = Date.now();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

async function search(query: string, viewbox?: GeoResult['boundingBox']): Promise<GeoResult | null> {
  const cacheKey = `${query.toLowerCase()}|${viewbox?.join(',') ?? ''}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    'accept-language': 'ru,en',
  });
  if (viewbox) {
    const [south, north, west, east] = viewbox;
    params.set('viewbox', `${west},${north},${east},${south}`);
  }

  const result = await schedule(async () => {
    const res = await fetch(`${BASE_URL}/search?${params}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Nominatim ответил ${res.status}`);
    const places = (await res.json()) as NominatimPlace[];
    const place = places[0];
    if (!place) return null;
    return {
      coordinates: { lat: Number(place.lat), lng: Number(place.lon) },
      displayName: place.display_name,
      boundingBox: place.boundingbox.map(Number) as GeoResult['boundingBox'],
    };
  });

  cache.set(cacheKey, result);
  return result;
}

async function safeSearch(query: string, viewbox?: GeoResult['boundingBox']): Promise<GeoResult | null> {
  try {
    return await search(query, viewbox);
  } catch (err) {
    console.warn(`[geocoder] "${query}": ${(err as Error).message}`);
    return null;
  }
}

export interface GeocodeStats {
  total: number;
  geocoded: number;
}

/**
 * Уточняет координаты всех точек маршрута через Nominatim.
 * Для каждой точки пробуем "Название, Город", затем "Адрес, Город";
 * при успехе координаты модели заменяются реальными и точка помечается geocoded = true.
 */
export async function refineCoordinates(
  itinerary: GeneratedItinerary,
  destination: string,
): Promise<GeocodeStats> {
  const items = itinerary.days.flatMap((d) => d.items);
  const stats: GeocodeStats = { total: items.length, geocoded: 0 };
  if (process.env.GEOCODER_ENABLED === '0' || items.length === 0) return stats;

  const city = await safeSearch(destination);

  for (const item of items) {
    const { name, address } = item.location;
    const queries = [`${name}, ${destination}`, address ? `${address}, ${destination}` : null].filter(
      (q): q is string => q !== null,
    );

    for (const query of queries) {
      const found = await safeSearch(query, city?.boundingBox);
      if (!found) continue;
      if (city && haversineKm(found.coordinates, city.coordinates) > MAX_DISTANCE_FROM_CITY_KM) continue;

      item.location.lat = found.coordinates.lat;
      item.location.lng = found.coordinates.lng;
      item.location.geocoded = true;
      stats.geocoded++;
      break;
    }
  }

  console.log(`[geocoder] ${destination}: уточнено ${stats.geocoded} из ${stats.total} точек`);
  return stats;
}
