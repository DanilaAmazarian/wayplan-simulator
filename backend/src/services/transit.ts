import type { Coordinates, Locale, TransitStop, TransportMode } from '@travel/shared';
import { haversineKm } from './geo.js';

/**
 * Поездка на метро, поезде, пароме или самолёте через Transitous (MOTIS).
 * Остановки и линии берутся из открытых фидов GTFS. Свой сервер — TRANSIT_URL.
 * Публичный API только для локальной разработки.
 */

const BASE_URL = (process.env.TRANSIT_URL || 'https://api.transitous.org').replace(/\/$/, '');
const USER_AGENT = process.env.TRANSIT_USER_AGENT ?? 'AI-Travel-Planner/0.1 (local development)';
const REQUEST_TIMEOUT_MS = 4_000;
/** Ближе этого расстояния вход и выход считаются одной остановкой. */
const SAME_STOP_KM = 0.3;

export type TransitTransport = 'metro' | 'train' | 'ferry' | 'plane';

const MODE_FAMILY: Record<TransitTransport, readonly string[]> = {
  metro: ['SUBWAY', 'METRO'],
  train: ['RAIL', 'HIGHSPEED_RAIL', 'LONG_DISTANCE', 'NIGHT_RAIL', 'REGIONAL_RAIL', 'REGIONAL_FAST_RAIL', 'SUBURBAN'],
  ferry: ['FERRY'],
  plane: ['AIRPLANE'],
};

/** Насколько далеко искать остановку и какой отступ bbox в градусах. */
const SEARCH: Record<TransitTransport, { pad: number; maxKm: number }> = {
  metro: { pad: 0.04, maxKm: 3 },
  train: { pad: 0.08, maxKm: 8 },
  ferry: { pad: 0.06, maxKm: 6 },
  plane: { pad: 0.25, maxKm: 40 },
};

export function isTransitTransport(transport: TransportMode): transport is TransitTransport {
  return transport === 'metro' || transport === 'train' || transport === 'ferry' || transport === 'plane';
}

export interface TransitDescription {
  status: 'ride' | 'same-stop' | 'unavailable';
  board?: TransitStop;
  alight?: TransitStop;
  line?: string;
  transfers: TransitStop[];
  /** Геометрия только самой поездки, без подхода по улицам. */
  geometry: Coordinates[];
  durationMin?: number;
}

interface RawStop {
  name?: string;
  stopId?: string;
  lat?: number;
  lon?: number;
  modes?: string[];
}

interface RawPlace {
  name?: string;
  lat?: number;
  lon?: number;
}

interface RawLeg {
  mode?: string;
  duration?: number;
  from?: RawPlace;
  to?: RawPlace;
  routeShortName?: string;
  displayName?: string;
  interlineWithPreviousLeg?: boolean;
  legGeometry?: { points?: string; precision?: number };
}

interface RawItinerary {
  duration?: number;
  legs?: RawLeg[];
}

interface RawPlan {
  itineraries?: RawItinerary[];
}

interface FoundStop extends TransitStop {
  id: string;
  modes: string[];
}

const stopCache = new Map<string, FoundStop[]>();
const routeCache = new Map<string, { mode?: string; routeShortName?: string }[]>();
const rideCache = new Map<string, TransitDescription>();

function cacheCoord(value: number): string {
  return value.toFixed(4);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[transit] HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[transit] ${(err as Error).message}`);
    return null;
  }
}

function toStop(place: RawPlace | undefined): TransitStop | null {
  if (!place || typeof place.name !== 'string' || place.name === 'START' || place.name === 'END') return null;
  if (typeof place.lat !== 'number' || typeof place.lon !== 'number') return null;
  return { name: place.name, coordinates: { lat: place.lat, lng: place.lon } };
}

/** Google polyline. Точность приходит в ответе: у Transitous v6 это 6. */
function decodePolyline(encoded: string, precision: number): Coordinates[] {
  const factor = 10 ** precision;
  const points: Coordinates[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / factor, lng: lng / factor });
  }

  return points;
}

function appendLine(target: Coordinates[], extra: Coordinates[]): void {
  for (const point of extra) {
    const last = target[target.length - 1];
    if (last && last.lat === point.lat && last.lng === point.lng) continue;
    target.push(point);
  }
}

function legLine(leg: RawLeg): Coordinates[] {
  const encoded = leg.legGeometry?.points;
  const precision = leg.legGeometry?.precision ?? 6;
  if (encoded) {
    const decoded = decodePolyline(encoded, precision);
    if (decoded.length > 1) return decoded;
  }
  const from = toStop(leg.from);
  const to = toStop(leg.to);
  if (from && to) return [from.coordinates, to.coordinates];
  return [];
}

async function stopsAround(point: Coordinates, transport: TransitTransport, locale: Locale): Promise<FoundStop[] | null> {
  const { pad } = SEARCH[transport];
  const south = point.lat - pad;
  const north = point.lat + pad;
  const west = point.lng - pad;
  const east = point.lng + pad;
  const key = `${locale}|${transport}|${south.toFixed(3)},${west.toFixed(3)},${north.toFixed(3)},${east.toFixed(3)}`;
  const cached = stopCache.get(key);
  if (cached) return cached;

  const params = new URLSearchParams({
    min: `${south},${west}`,
    max: `${north},${east}`,
    modes: MODE_FAMILY[transport].join(','),
    language: locale,
  });
  const body = await fetchJson<RawStop[]>(`${BASE_URL}/api/v6/map/stops?${params}`);
  if (!Array.isArray(body)) return null;
  const family = new Set(MODE_FAMILY[transport]);
  const stops: FoundStop[] = [];
  for (const stop of body ?? []) {
    if (typeof stop.name !== 'string' || typeof stop.stopId !== 'string') continue;
    if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') continue;
    const modes = (stop.modes ?? []).filter((mode) => family.has(mode));
    if (modes.length === 0) continue;
    stops.push({
      id: stop.stopId,
      name: stop.name,
      coordinates: { lat: stop.lat, lng: stop.lon },
      modes,
    });
  }
  stopCache.set(key, stops);
  return stops;
}

async function stopRoutes(stopId: string): Promise<{ mode?: string; routeShortName?: string }[]> {
  const cached = routeCache.get(stopId);
  if (cached) return cached;
  const params = new URLSearchParams({ stopId });
  const body = await fetchJson<{ routes?: { mode?: string; routeShortName?: string }[] }>(`${BASE_URL}/api/v6/stop?${params}`);
  const routes = body?.routes ?? [];
  if (body) routeCache.set(stopId, routes);
  return routes;
}

/** Общий номер линии, если обе станции обслуживает ровно одна линия этого вида транспорта. */
async function sharedLine(board: FoundStop, alight: FoundStop, transport: TransitTransport): Promise<string | undefined> {
  const family = new Set(MODE_FAMILY[transport]);
  const [fromRoutes, toRoutes] = await Promise.all([stopRoutes(board.id), stopRoutes(alight.id)]);
  const fromNames = new Set(
    fromRoutes.filter((route) => route.mode && family.has(route.mode) && route.routeShortName).map((route) => route.routeShortName),
  );
  const shared = [
    ...new Set(
      toRoutes
        .filter((route) => route.mode && family.has(route.mode) && route.routeShortName && fromNames.has(route.routeShortName))
        .map((route) => route.routeShortName as string),
    ),
  ];
  return shared.length === 1 ? shared[0] : undefined;
}

function nearestStop(point: Coordinates, stops: FoundStop[], maxKm: number): FoundStop | null {
  let best: FoundStop | null = null;
  let bestKm = maxKm;
  for (const stop of stops) {
    const km = haversineKm(point, stop.coordinates);
    if (km < bestKm) {
      bestKm = km;
      best = stop;
    }
  }
  return best;
}

function samePlace(a: TransitStop, b: TransitStop): boolean {
  return a.name === b.name || haversineKm(a.coordinates, b.coordinates) < SAME_STOP_KM;
}

function matchesStop(place: RawPlace | undefined, stop: TransitStop): boolean {
  if (!place) return false;
  if (place.name === stop.name) return true;
  if (typeof place.lat !== 'number' || typeof place.lon !== 'number') return false;
  return haversineKm(stop.coordinates, { lat: place.lat, lng: place.lon }) < SAME_STOP_KM;
}

function readItinerary(
  itinerary: RawItinerary,
  transport: TransitTransport,
  board: TransitStop,
  alight: TransitStop,
): TransitDescription | null {
  const family = new Set(MODE_FAMILY[transport]);
  const legs = (itinerary.legs ?? []).filter((leg) => leg.mode && family.has(leg.mode));
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (!first || !last) return null;
  if (!matchesStop(first.from, board) || !matchesStop(last.to, alight)) return null;

  const geometry: Coordinates[] = [];
  const transfers: TransitStop[] = [];
  legs.forEach((leg, index) => {
    appendLine(geometry, legLine(leg));
    const next = legs[index + 1];
    if (!next || next.interlineWithPreviousLeg) return;
    const change = toStop(leg.to);
    if (change && !samePlace(change, alight) && !samePlace(change, board)) transfers.push(change);
  });

  const lineNames = [...new Set(legs.map((leg) => leg.routeShortName || leg.displayName).filter((name): name is string => !!name))];
  const durationSec = itinerary.duration ?? legs.reduce((sum, leg) => sum + (leg.duration ?? 0), 0);

  return {
    status: 'ride',
    board,
    alight,
    line: lineNames.length === 1 ? lineNames[0] : undefined,
    transfers,
    geometry: geometry.length > 1 ? geometry : [board.coordinates, alight.coordinates],
    durationMin: durationSec > 0 ? Math.max(1, Math.round(durationSec / 60)) : undefined,
  };
}

async function planBetween(
  transport: TransitTransport,
  board: TransitStop,
  alight: TransitStop,
  when: string,
  locale: Locale,
): Promise<TransitDescription | null> {
  const params = new URLSearchParams({
    fromPlace: `${board.coordinates.lat},${board.coordinates.lng}`,
    toPlace: `${alight.coordinates.lat},${alight.coordinates.lng}`,
    transitModes: MODE_FAMILY[transport].join(','),
    directModes: '',
    radius: '2000',
    numItineraries: '3',
    language: locale,
    time: when,
  });

  let body = await fetchJson<RawPlan>(`${BASE_URL}/api/v6/plan?${params}`);
  if (!body?.itineraries?.length) {
    params.delete('time');
    body = await fetchJson<RawPlan>(`${BASE_URL}/api/v6/plan?${params}`);
  }

  for (const itinerary of body?.itineraries ?? []) {
    const ride = readItinerary(itinerary, transport, board, alight);
    if (ride) return ride;
  }
  return null;
}

/**
 * Ближайшая остановка к началу, ближайшая к концу и поездка между ними.
 * null не возвращается: нет остановок — status unavailable.
 */
export async function describeRide(
  transport: TransitTransport,
  from: Coordinates,
  to: Coordinates,
  when: string,
  locale: Locale,
): Promise<TransitDescription> {
  const key = `${locale}|${transport}|${cacheCoord(from.lat)},${cacheCoord(from.lng)}|${cacheCoord(to.lat)},${cacheCoord(to.lng)}|${when.slice(0, 13)}`;
  const cached = rideCache.get(key);
  if (cached) return cached;

  const { maxKm } = SEARCH[transport];
  const [fromStops, toStops] = await Promise.all([
    stopsAround(from, transport, locale),
    stopsAround(to, transport, locale),
  ]);
  if (!fromStops || !toStops) return { status: 'unavailable', transfers: [], geometry: [] };
  const board = nearestStop(from, fromStops, maxKm);
  const alight = nearestStop(to, toStops, maxKm);

  let result: TransitDescription;
  if (!board || !alight) {
    result = { status: 'unavailable', transfers: [], geometry: [] };
  } else if (samePlace(board, alight)) {
    result = { status: 'same-stop', board, alight: board, transfers: [], geometry: [] };
  } else {
    const planned = await planBetween(transport, board, alight, when, locale);
    const line = planned?.line ?? (planned?.transfers.length ? undefined : await sharedLine(board, alight, transport));
    result = planned
      ? { ...planned, line }
      : {
          status: 'ride',
          board,
          alight,
          line,
          transfers: [],
          geometry: [board.coordinates, alight.coordinates],
        };
  }

  rideCache.set(key, result);
  return result;
}
