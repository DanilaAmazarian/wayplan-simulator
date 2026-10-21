import { randomBytes } from 'node:crypto';
import {
  isLocale,
  type Coordinates,
  type DayPlan,
  type GenerateTripRequest,
  type ItineraryItem,
  type Locale,
  type LocationType,
  type Route,
  type RouteSegment,
  type ShareLinkResponse,
  type TransportMode,
  type Trip,
  type TripSummary,
  type UpdateTripRequest,
} from '@travel/shared';
import { fallbackTitle } from './phrases.js';
import type { ItineraryItem as DbItem, Trip as DbTrip } from '../../generated/prisma/client.js';
import { prisma } from '../db.js';
import { HttpError, throwIfAborted } from '../errors.js';
import { refineCoordinates } from './geocoder.js';
import { haversineKm } from './geo.js';
import { optimizeDay } from './itineraryOrder.js';
import { requestedPlaceKinds, unwantedName } from './placeQuality.js';
import { roadProfile, routeLegs, type OsrmProfile } from './osrm.js';
import { describeRide, isTransitTransport } from './transit.js';
import type { GeneratedDay } from './openai.js';
import { generateItinerary } from './openai.js';

type DbTripWithItems = DbTrip & { items: DbItem[]; shares?: { token: string }[] };

/** Активная ссылка подгружается только для ответов владельца. */
const ownerTripInclude = {
  items: true,
  shares: {
    where: { revokedAt: null },
    orderBy: { createdAt: 'asc' as const },
    take: 1,
    select: { token: true },
  },
};

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

function straightRoute(from: Coordinates, to: Coordinates, transport: TransportMode): Route {
  return {
    from,
    to,
    transport,
    distanceKm: Math.round(haversineKm(from, to) * 100) / 100,
  };
}

interface LegDraft {
  from: Coordinates;
  to: Coordinates;
  transport: TransportMode;
  profile: OsrmProfile | null;
  arrivalTime: string;
}

function toWhen(date: string, time: string): string {
  const [hours, minutes] = time.split(':');
  return `${date}T${(hours ?? '12').padStart(2, '0')}:${(minutes ?? '00').padStart(2, '0')}:00Z`;
}

function geometryKm(points: Coordinates[]): number {
  let sum = 0;
  for (let index = 1; index < points.length; index += 1) {
    sum += haversineKm(points[index - 1]!, points[index]!);
  }
  return Math.round(sum * 100) / 100;
}

/** Пеший кусок. Если OSRM молчит, остаётся прямая, чтобы линия не рвалась. */
async function streetSegment(from: Coordinates, to: Coordinates): Promise<{ geometry: Coordinates[]; km: number; min?: number }> {
  const road = await routeLegs('foot', [from, to]);
  const leg = road?.[0];
  if (leg && leg.geometry.length > 1) {
    return { geometry: leg.geometry, km: leg.distanceKm, min: leg.durationMin };
  }
  return { geometry: [from, to], km: Math.round(haversineKm(from, to) * 100) / 100 };
}

async function buildTransitRoute(draft: LegDraft, date: string, locale: Locale): Promise<Route> {
  const base = straightRoute(draft.from, draft.to, draft.transport);
  if (!isTransitTransport(draft.transport)) return { ...base, ride: { status: 'unavailable' } };

  const ride = await describeRide(draft.transport, draft.from, draft.to, toWhen(date, draft.arrivalTime), locale);
  if (ride.status === 'unavailable' || !ride.board) {
    return { ...base, ride: { status: 'unavailable' } };
  }

  if (ride.status === 'same-stop') {
    const walk = await streetSegment(draft.from, draft.to);
    const onRoad = walk.geometry.length > 2 || walk.km > 0;
    return {
      ...base,
      distanceKm: walk.km,
      durationMin: walk.min,
      geometry: onRoad ? walk.geometry : undefined,
      segments: [{ kind: 'street', geometry: walk.geometry }],
      ride: { status: 'same-stop', board: ride.board, alight: ride.board },
    };
  }

  if (!ride.alight) return { ...base, ride: { status: 'unavailable' } };

  const walkIn = await streetSegment(draft.from, ride.board.coordinates);
  const walkOut = await streetSegment(ride.alight.coordinates, draft.to);
  const transitGeometry = ride.geometry.length > 1 ? ride.geometry : [ride.board.coordinates, ride.alight.coordinates];
  const segments: RouteSegment[] = [
    { kind: 'street', geometry: walkIn.geometry },
    { kind: 'transit', geometry: transitGeometry, label: ride.line },
    { kind: 'street', geometry: walkOut.geometry },
  ];
  const minutes = ride.durationMin ? (walkIn.min ?? 0) + ride.durationMin + (walkOut.min ?? 0) : undefined;

  return {
    from: draft.from,
    to: draft.to,
    transport: draft.transport,
    distanceKm: Math.round((walkIn.km + geometryKm(transitGeometry) + walkOut.km) * 100) / 100,
    durationMin: minutes,
    ride: {
      status: 'ride',
      board: ride.board,
      alight: ride.alight,
      line: ride.line,
      transfers: ride.transfers,
    },
    segments,
  };
}

/**
 * Соседние плечи с одним профилем уходят в OSRM одним запросом.
 * Метро, поезд, паром и самолёт ищут остановки через Transitous.
 */
async function buildRoutes(items: ItineraryItem[], date: string, locale: Locale): Promise<Route[]> {
  const legs: LegDraft[] = items.slice(1).map((item, index) => {
    const from = items[index]!.location.coordinates;
    const to = item.location.coordinates;
    const samePoint = from.lat === to.lat && from.lng === to.lng;
    return {
      from,
      to,
      transport: item.transport,
      profile: samePoint ? null : roadProfile(item.transport),
      arrivalTime: item.startTime,
    };
  });

  const routes = legs.map((leg) => straightRoute(leg.from, leg.to, leg.transport));

  let index = 0;
  while (index < legs.length) {
    const draft = legs[index]!;
    if (!draft.profile) {
      if (isTransitTransport(draft.transport)) routes[index] = await buildTransitRoute(draft, date, locale);
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < legs.length && legs[end]!.profile === draft.profile) end += 1;

    const points = [draft.from, ...legs.slice(index, end).map((leg) => leg.to)];
    const road = await routeLegs(draft.profile, points);
    if (road && road.length === end - index) {
      for (let offset = 0; offset < road.length; offset += 1) {
        const leg = road[offset]!;
        if (leg.geometry.length < 2) continue;
        const part = legs[index + offset]!;
        routes[index + offset] = {
          from: part.from,
          to: part.to,
          transport: part.transport,
          distanceKm: leg.distanceKm,
          durationMin: leg.durationMin,
          geometry: leg.geometry,
        };
      }
    }
    index = end;
  }

  return routes;
}

export async function toSharedTrip(trip: DbTripWithItems, shareToken?: string | null, owned?: boolean): Promise<Trip> {
  const locale = isLocale(trip.locale) ? trip.locale : 'ru';
  const dayTitles: string[] = trip.dayTitles ? (JSON.parse(trip.dayTitles) as string[]) : [];
  const byDay = new Map<number, DbItem[]>();
  for (const item of trip.items) {
    const list = byDay.get(item.dayNumber) ?? [];
    list.push(item);
    byDay.set(item.dayNumber, list);
  }

  const days: DayPlan[] = await Promise.all(
    [...byDay.entries()]
      .sort(([a], [b]) => a - b)
      .map(async ([dayNumber, dbItems]) => {
        const date = new Date(trip.startDate);
        date.setUTCDate(date.getUTCDate() + dayNumber - 1);

        const items: ItineraryItem[] = dbItems
          .sort((a, b) => a.order - b.order)
          .map((it) => ({
            id: it.id,
            startTime: it.startTime,
            endTime: it.endTime ?? undefined,
            transport: it.transport as TransportMode,
            order: it.order,
            notes: it.notes ?? undefined,
            location: {
              id: it.id,
              name: it.locationName,
              description: it.locationDescription,
              type: it.locationType as LocationType,
              address: it.locationAddress ?? undefined,
              coordinates: { lat: it.lat, lng: it.lng },
              geocoded: it.geocoded,
            },
          }));

        return {
          dayNumber,
          date: toIsoDate(date),
          title: dayTitles[dayNumber - 1],
          items,
          routes: await buildRoutes(items, toIsoDate(date), locale),
        };
      }),
  );

  const mapped: Trip = {
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    startDate: toIsoDate(trip.startDate),
    endDate: toIsoDate(trip.endDate),
    preferences: trip.preferences ?? undefined,
    saved: trip.saved,
    locale,
    days,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
  };

  if (shareToken !== undefined) mapped.shareToken = shareToken;
  if (owned !== undefined) mapped.owned = owned;
  return mapped;
}

function activeShareToken(trip: { shares?: { token: string }[] }): string | null {
  return trip.shares?.[0]?.token ?? null;
}

function toDbItems(days: GeneratedDay[]) {
  return days.flatMap((day) =>
    optimizeDay(day.items).map((it, order) => ({
      dayNumber: day.dayNumber,
      order,
      startTime: it.startTime,
      endTime: it.endTime,
      transport: it.transport,
      notes: it.notes,
      locationName: it.location.name,
      locationDescription: it.location.description,
      locationType: it.location.type,
      locationAddress: it.location.address,
      lat: it.location.lat,
      lng: it.location.lng,
      geocoded: it.location.geocoded ?? false,
    })),
  );
}

export async function generateAndSaveTrip(
  req: GenerateTripRequest,
  userId: string,
  signal?: AbortSignal,
): Promise<Trip> {
  const locale = isLocale(req.locale) ? req.locale : 'ru';
  const itinerary = await generateItinerary({ ...req, locale }, signal);
  throwIfAborted(signal);
  const allow = requestedPlaceKinds(req.preferences);
  for (const day of itinerary.days) {
    for (const item of day.items) {
      const reason = unwantedName(item.location.name);
      if (reason && !allow.has(reason)) item.location.dropReason = reason;
    }
  }
  await refineCoordinates(itinerary, req.destination, locale, signal, allow);
  throwIfAborted(signal);

  const dropped = itinerary.days.flatMap((day) => day.items).filter((item) => item.location.dropReason);
  if (dropped.length > 0) {
    console.log(
      `[places] отброшено ${dropped.length}: ${dropped.map((item) => `${item.location.name} (${item.location.dropReason})`).join(', ')}`,
    );
  }
  itinerary.days = itinerary.days
    .map((day) => ({ ...day, items: day.items.filter((item) => !item.location.dropReason) }))
    .filter((day) => day.items.length > 0)
    .map((day, index) => ({ ...day, dayNumber: index + 1 }));
  if (itinerary.days.length === 0) {
    throw new HttpError(502, 'Не удалось собрать маршрут из открытых мест. Попробуйте ещё раз.');
  }

  const startDate = new Date(`${toIsoDate(new Date())}T00:00:00.000Z`);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + itinerary.days.length - 1);

  const trip = await prisma.trip.create({
    data: {
      title: itinerary.title || fallbackTitle(locale, req.destination, req.durationDays),
      destination: req.destination,
      startDate,
      endDate,
      preferences: req.preferences || null,
      locale,
      dayTitles: JSON.stringify(itinerary.days.map((d) => d.title)),
      userId,
      items: { create: toDbItems(itinerary.days) },
    },
    include: { items: true },
  });

  return await toSharedTrip(trip, null, true);
}

/** Чужая поездка неотличима от отсутствующей. Без владельца — только просмотр. */
async function requireOwnedTrip(id: string, userId: string): Promise<void> {
  const trip = await prisma.trip.findUnique({ where: { id }, select: { userId: true } });
  if (!trip || trip.userId !== userId) {
    if (trip?.userId === null) throw new HttpError(403, 'Эту поездку можно только смотреть');
    throw new HttpError(404, 'Поездка не найдена');
  }
}

export async function getTrip(id: string, userId: string): Promise<Trip | null> {
  const trip = await prisma.trip.findUnique({ where: { id }, include: ownerTripInclude });
  if (!trip || (trip.userId !== null && trip.userId !== userId)) return null;
  if (trip.userId === null) return await toSharedTrip(trip, undefined, false);
  return await toSharedTrip(trip, activeShareToken(trip), true);
}

export async function listTrips(userId: string, filter: { saved?: boolean } = {}): Promise<TripSummary[]> {
  const trips = await prisma.trip.findMany({
    where: {
      userId,
      ...(filter.saved === undefined ? {} : { saved: filter.saved }),
    },
    orderBy: { updatedAt: 'desc' },
    include: { items: { select: { dayNumber: true } } },
  });
  return trips.map((t) => ({
    id: t.id,
    title: t.title,
    destination: t.destination,
    startDate: toIsoDate(t.startDate),
    endDate: toIsoDate(t.endDate),
    saved: t.saved,
    daysCount: new Set(t.items.map((i) => i.dayNumber)).size,
    itemsCount: t.items.length,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}

export async function updateTrip(id: string, userId: string, data: UpdateTripRequest): Promise<Trip> {
  await requireOwnedTrip(id, userId);
  const trip = await prisma.trip.update({ where: { id }, data, include: ownerTripInclude });
  return await toSharedTrip(trip, activeShareToken(trip), true);
}

export async function deleteTrip(id: string, userId: string): Promise<void> {
  await requireOwnedTrip(id, userId);
  await prisma.trip.delete({ where: { id } });
}

/** Активная ссылка одна: повторный вызов возвращает уже выданный токен. */
export async function createOrGetShareLink(tripId: string, userId: string): Promise<ShareLinkResponse> {
  await requireOwnedTrip(tripId, userId);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.shareLink.findFirst({
      where: { tripId, revokedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return { token: existing.token };

    const created = await tx.shareLink.create({
      data: { tripId, token: randomBytes(16).toString('base64url') },
    });
    return { token: created.token };
  });
}

/** Гасит активные ссылки поездки. `false` — поездки нет; отсутствие ссылки ошибкой не считается. */
export async function revokeShareLink(tripId: string, userId: string): Promise<void> {
  await requireOwnedTrip(tripId, userId);
  await prisma.shareLink.updateMany({
    where: { tripId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Актуальный маршрут по токену. Отозванная и неизвестная ссылки неотличимы. */
export async function getTripByShareToken(token: string): Promise<Trip | null> {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { trip: { include: { items: true } } },
  });
  if (!link || link.revokedAt) return null;
  return await toSharedTrip(link.trip);
}
