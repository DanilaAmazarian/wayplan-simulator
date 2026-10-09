import type {
  DayPlan,
  GenerateTripRequest,
  ItineraryItem,
  LocationType,
  Route,
  TransportMode,
  Trip,
  TripSummary,
  UpdateTripRequest,
} from '@travel/shared';
import type { ItineraryItem as DbItem, Trip as DbTrip } from '../../generated/prisma/client.js';
import { prisma } from '../db.js';
import { refineCoordinates } from './geocoder.js';
import { haversineKm, nearestNeighborOrder } from './geo.js';
import type { GeneratedDay, GeneratedItem } from './openai.js';
import { generateItinerary } from './openai.js';

type DbTripWithItems = DbTrip & { items: DbItem[] };

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Переупорядочивает точки дня по географической близости.
 * Временные слоты, предложенные моделью, сохраняются и раздаются точкам в новом порядке.
 */
export function optimizeDay(items: GeneratedItem[]): GeneratedItem[] {
  const chronological = [...items].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const slots = chronological.map(({ startTime, endTime }) => ({ startTime, endTime }));
  const ordered = nearestNeighborOrder(chronological, (it) => it.location);

  return ordered.map((it, idx) => ({
    ...it,
    ...slots[idx]!,
    transport: idx === 0 ? 'walk' : it.transport,
  }));
}

function buildRoutes(items: ItineraryItem[]): Route[] {
  return items.slice(1).map((item, i) => {
    const from = items[i]!.location.coordinates;
    const to = item.location.coordinates;
    return {
      from,
      to,
      transport: item.transport,
      distanceKm: Math.round(haversineKm(from, to) * 100) / 100,
    };
  });
}

export function toSharedTrip(trip: DbTripWithItems): Trip {
  const dayTitles: string[] = trip.dayTitles ? (JSON.parse(trip.dayTitles) as string[]) : [];
  const byDay = new Map<number, DbItem[]>();
  for (const item of trip.items) {
    const list = byDay.get(item.dayNumber) ?? [];
    list.push(item);
    byDay.set(item.dayNumber, list);
  }

  const days: DayPlan[] = [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayNumber, dbItems]) => {
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
        routes: buildRoutes(items),
      };
    });

  return {
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    startDate: toIsoDate(trip.startDate),
    endDate: toIsoDate(trip.endDate),
    preferences: trip.preferences ?? undefined,
    saved: trip.saved,
    days,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
  };
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

export async function generateAndSaveTrip(req: GenerateTripRequest): Promise<Trip> {
  const itinerary = await generateItinerary(req);
  await refineCoordinates(itinerary, req.destination);

  const startDate = new Date(`${toIsoDate(new Date())}T00:00:00.000Z`);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + itinerary.days.length - 1);

  const trip = await prisma.trip.create({
    data: {
      title: itinerary.title || `${req.destination}: ${req.durationDays} дн.`,
      destination: req.destination,
      startDate,
      endDate,
      preferences: req.preferences || null,
      dayTitles: JSON.stringify(itinerary.days.map((d) => d.title)),
      items: { create: toDbItems(itinerary.days) },
    },
    include: { items: true },
  });

  return toSharedTrip(trip);
}

export async function getTrip(id: string): Promise<Trip | null> {
  const trip = await prisma.trip.findUnique({ where: { id }, include: { items: true } });
  return trip ? toSharedTrip(trip) : null;
}

export async function listTrips(filter: { saved?: boolean } = {}): Promise<TripSummary[]> {
  const trips = await prisma.trip.findMany({
    where: filter.saved === undefined ? {} : { saved: filter.saved },
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

export async function updateTrip(id: string, data: UpdateTripRequest): Promise<Trip | null> {
  const exists = await prisma.trip.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return null;
  const trip = await prisma.trip.update({ where: { id }, data, include: { items: true } });
  return toSharedTrip(trip);
}

export async function deleteTrip(id: string): Promise<boolean> {
  const { count } = await prisma.trip.deleteMany({ where: { id } });
  return count > 0;
}
