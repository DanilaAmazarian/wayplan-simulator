import type { Coordinates, Locale, LocationType } from '@travel/shared';
import { isAbortError, throwIfAborted } from '../errors.js';
import { haversineKm } from './geo.js';
import type { GeneratedItinerary } from './openai.js';
import {
  formatOsmAddress,
  nameScore,
  osmDropReason,
  placeRankScore,
  roadMatches,
  type OsmAddressParts,
  type PlaceDropReason,
} from './placeQuality.js';

/**
 * Геокодер OpenStreetMap Nominatim.
 * Политика публичного API: не более 1 запроса в секунду, осмысленный User-Agent, кэширование результатов.
 * https://operations.osmfoundation.org/policies/nominatim/
 */

const BASE_URL = process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';
const USER_AGENT = process.env.NOMINATIM_USER_AGENT ?? 'AI-Travel-Planner/0.1 (local development)';
const MIN_INTERVAL_MS = 1000;
const REQUEST_TIMEOUT_MS = 5_000;
/** Дольше не держим ответ: остальные точки остаются с координатами модели. */
const BUDGET_MS = 30_000;
/** Точка дальше этого расстояния от центра города считается ошибочным совпадением. */
const MAX_DISTANCE_FROM_CITY_KM = 50;
/** Ниже — страна, регион или сам город. Такие совпадения ставят пин в центр, а не на адрес. */
const MIN_PLACE_RANK = 18;
/** Имя запроса и имя OSM должны заметно совпасть, иначе это другое место. */
const NAME_MATCH = 0.5;
/** Для поиска по улице хватает более слабого совпадения имени. */
const ADDRESS_NAME_MATCH = 0.34;

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  category?: string;
  type?: string;
  place_rank?: number;
  importance?: number;
  /** [south, north, west, east] */
  boundingbox: [string, string, string, string];
  address?: OsmAddressParts;
  extratags?: Record<string, string>;
}

interface GeoResult {
  coordinates: Coordinates;
  displayName: string;
  boundingBox: [number, number, number, number];
  name: string;
  placeRank: number;
  importance: number;
  category: string;
  type: string;
  road: string | null;
  addressLine: string | null;
  extratags: Record<string, string>;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }
    const timer = setTimeout(finish, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    };
    function finish() {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });

class GeocoderDown extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeocoderDown';
  }
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && err.name === 'TimeoutError';
}

const cache = new Map<string, GeoResult[]>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

/** Глобальная очередь: запросы выполняются строго последовательно с паузой ≥ 1 с. */
function schedule<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const run = queue.then(async () => {
    throwIfAborted(signal);
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait, signal);
    throwIfAborted(signal);
    try {
      return await task();
    } finally {
      lastRequestAt = Date.now();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

function toResult(place: NominatimPlace): GeoResult | null {
  const lat = Number(place.lat);
  const lng = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const road = place.address?.road || place.address?.pedestrian || place.address?.square || place.address?.footway || null;
  return {
    coordinates: { lat, lng },
    displayName: place.display_name,
    boundingBox: place.boundingbox.map(Number) as GeoResult['boundingBox'],
    name: place.name || place.display_name.split(',')[0]?.trim() || '',
    placeRank: place.place_rank ?? 30,
    importance: place.importance ?? 0,
    category: place.category ?? '',
    type: place.type ?? '',
    road,
    addressLine: formatOsmAddress(place.address),
    extratags: place.extratags ?? {},
  };
}

async function search(
  query: string,
  locale: Locale,
  viewbox: GeoResult['boundingBox'] | undefined,
  signal?: AbortSignal,
): Promise<GeoResult[]> {
  throwIfAborted(signal);
  const bounded = viewbox ? '1' : '0';
  const cacheKey = `${locale}|${bounded}|${query.toLowerCase()}|${viewbox?.join(',') ?? ''}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '20',
    addressdetails: '1',
    extratags: '1',
    'accept-language': locale,
  });
  if (viewbox) {
    const [south, north, west, east] = viewbox;
    params.set('viewbox', `${west},${north},${east},${south}`);
    params.set('bounded', '1');
  }

  const result = await schedule(async () => {
    const res = await fetch(`${BASE_URL}/search?${params}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: signal
        ? AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), signal])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      throw new GeocoderDown(`Nominatim ответил ${res.status}`);
    }
    if (!res.ok) throw new Error(`Nominatim ответил ${res.status}`);
    const places = (await res.json()) as NominatimPlace[];
    return places.flatMap((place) => {
      const parsed = toResult(place);
      return parsed ? [parsed] : [];
    });
  }, signal);

  cache.set(cacheKey, result);
  return result;
}

async function safeSearch(
  query: string,
  locale: Locale,
  viewbox: GeoResult['boundingBox'] | undefined,
  signal?: AbortSignal,
): Promise<GeoResult[]> {
  try {
    return await search(query, locale, viewbox, signal);
  } catch (err) {
    if (signal?.aborted || isAbortError(err)) throw err;
    if (err instanceof GeocoderDown || isTimeout(err)) {
      throw new GeocoderDown(err instanceof Error ? err.message : 'Nominatim недоступен');
    }
    console.warn(`[geocoder] "${query}": ${(err as Error).message}`);
    return [];
  }
}

export interface GeocodeStats {
  total: number;
  geocoded: number;
}

function withinCity(found: GeoResult, city: GeoResult | null): boolean {
  if (!city) return true;
  return haversineKm(found.coordinates, city.coordinates) <= MAX_DISTANCE_FROM_CITY_KM;
}

function byRank(queryName: string, locationType: LocationType) {
  return (a: GeoResult, b: GeoResult) =>
    placeRankScore({
      queryName,
      candidateName: b.name,
      importance: b.importance,
      category: b.category,
      type: b.type,
      locationType,
    }) -
    placeRankScore({
      queryName,
      candidateName: a.name,
      importance: a.importance,
      category: a.category,
      type: a.type,
      locationType,
    });
}

/**
 * Берёт лучшее совпадение. Пин и адрес всегда из одной записи OSM.
 * Закрытые, строящиеся и фастфуд-точки не принимаются.
 */
function takeMatch(
  results: GeoResult[],
  city: GeoResult | null,
  queryName: string,
  locationType: LocationType,
  accept: (place: GeoResult) => boolean,
  allow: ReadonlySet<PlaceDropReason>,
): { place: GeoResult } | { reason: PlaceDropReason } | null {
  let rejected: PlaceDropReason | null = null;
  const ranked = results.filter((place) => withinCity(place, city)).sort(byRank(queryName, locationType));
  for (const place of ranked) {
    if (!accept(place)) continue;
    const reason = osmDropReason({
      category: place.category,
      type: place.type,
      extratags: place.extratags,
      locationType,
      name: place.name || queryName,
    });
    if (reason && !allow.has(reason)) {
      rejected = reason;
      continue;
    }
    return { place };
  }
  return rejected ? { reason: rejected } : null;
}

function applyHit(item: GeneratedItinerary['days'][number]['items'][number]['location'], place: GeoResult): void {
  item.lat = place.coordinates.lat;
  item.lng = place.coordinates.lng;
  item.geocoded = true;
  // Адрес на карточке — тот, на который встал пин. Выдуманную улицу модели не оставляем.
  item.address = place.addressLine;
}

/**
 * Уточняет координаты точек через Nominatim.
 * Совпадение по имени важнее черновых координат. Адрес на карточке заменяется адресом OSM.
 * Фастфуд, ТЦ, стройки и закрытые площадки помечаются dropReason и в маршрут не попадают.
 */
export async function refineCoordinates(
  itinerary: GeneratedItinerary,
  destination: string,
  locale: Locale,
  signal?: AbortSignal,
  allow: ReadonlySet<PlaceDropReason> = new Set(),
): Promise<GeocodeStats> {
  const items = itinerary.days.flatMap((day) => day.items).filter((item) => !item.location.dropReason);
  const stats: GeocodeStats = { total: itinerary.days.flatMap((day) => day.items).length, geocoded: 0 };
  if (process.env.GEOCODER_ENABLED === '0' || items.length === 0) return stats;

  throwIfAborted(signal);
  const deadline = Date.now() + BUDGET_MS;

  try {
    const cityHits = await safeSearch(destination, locale, undefined, signal);
    const city = cityHits[0] ?? null;

    for (const item of items) {
      throwIfAborted(signal);
      if (Date.now() >= deadline) {
        console.warn(`[geocoder] ${destination}: лимит ${BUDGET_MS / 1000} с, уточнено ${stats.geocoded} из ${stats.total}`);
        break;
      }

      const { name, address } = item.location;
      const nameQuery = `${name}, ${destination}`;
      const nameAccept = (place: GeoResult) => place.placeRank >= MIN_PLACE_RANK && nameScore(name, place.name) >= NAME_MATCH;
      let chosen: GeoResult | null = null;
      let rejected: PlaceDropReason | null = null;

      const consider = (found: ReturnType<typeof takeMatch>) => {
        if (!found || chosen) return;
        if ('place' in found) chosen = found.place;
        else rejected = found.reason;
      };

      consider(
        takeMatch(
          await safeSearch(nameQuery, locale, city?.boundingBox, signal),
          city,
          name,
          item.location.type,
          nameAccept,
          allow,
        ),
      );
      if (!chosen && city?.boundingBox && Date.now() < deadline) {
        consider(
          takeMatch(await safeSearch(nameQuery, locale, undefined, signal), city, name, item.location.type, nameAccept, allow),
        );
      }
      if (!chosen && !rejected && address && Date.now() < deadline) {
        consider(
          takeMatch(
            await safeSearch(`${address}, ${destination}`, locale, city?.boundingBox, signal),
            city,
            name,
            item.location.type,
            (place) =>
              place.placeRank >= MIN_PLACE_RANK &&
              (nameScore(name, place.name) >= ADDRESS_NAME_MATCH || roadMatches(address, place.road)),
            allow,
          ),
        );
      }

      if (chosen) {
        applyHit(item.location, chosen);
        stats.geocoded++;
      } else if (rejected) {
        item.location.dropReason = rejected;
      }
    }
  } catch (err) {
    if (!(err instanceof GeocoderDown)) throw err;
    console.warn(`[geocoder] ${destination}: остановлен (${err.message}), уточнено ${stats.geocoded} из ${stats.total}`);
  }

  console.log(`[geocoder] ${destination}: уточнено ${stats.geocoded} из ${stats.total} точек`);
  return stats;
}
