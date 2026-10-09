/**
 * Общие типы данных AI Travel Planner.
 * Используются и бэкендом, и фронтендом.
 */

/** Географические координаты (WGS84). */
export interface Coordinates {
  lat: number;
  lng: number;
}

export type LocationType =
  | 'attraction'
  | 'museum'
  | 'restaurant'
  | 'cafe'
  | 'hotel'
  | 'park'
  | 'shopping'
  | 'nightlife'
  | 'transport_hub'
  | 'other';

export interface Location {
  id: string;
  name: string;
  description: string;
  type: LocationType;
  coordinates: Coordinates;
  address?: string;
  /** true — координаты подтверждены геокодером OpenStreetMap, false — предложены моделью. */
  geocoded?: boolean;
}

export type TransportMode =
  | 'walk'
  | 'bike'
  | 'car'
  | 'taxi'
  | 'bus'
  | 'metro'
  | 'train'
  | 'ferry'
  | 'plane';

/** Элемент маршрута: посещение одной локации в определённое время. */
export interface ItineraryItem {
  id: string;
  /** Время начала в формате "HH:mm". */
  startTime: string;
  /** Время окончания в формате "HH:mm". */
  endTime?: string;
  location: Location;
  /** Транспорт, которым добираемся до этой локации от предыдущей. */
  transport: TransportMode;
  /** Порядковый номер в рамках дня (начиная с 0). */
  order: number;
  notes?: string;
}

/** Отрезок пути между двумя соседними точками дня (для Polyline на карте). */
export interface Route {
  from: Coordinates;
  to: Coordinates;
  transport: TransportMode;
  distanceKm?: number;
  durationMin?: number;
}

export interface DayPlan {
  /** Номер дня поездки (начиная с 1). */
  dayNumber: number;
  /** Дата в формате ISO "YYYY-MM-DD". */
  date: string;
  title?: string;
  items: ItineraryItem[];
  routes?: Route[];
}

export interface Trip {
  id: string;
  title: string;
  destination: string;
  /** Дата начала в формате ISO "YYYY-MM-DD". */
  startDate: string;
  /** Дата окончания в формате ISO "YYYY-MM-DD". */
  endDate: string;
  preferences?: string;
  /** Пользователь добавил маршрут в «Мои маршруты». Сгенерированные поездки по умолчанию — черновики. */
  saved: boolean;
  days: DayPlan[];
  createdAt: string;
  updatedAt: string;
}

/** Краткая карточка поездки для списка сохранённых маршрутов. */
export interface TripSummary {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  saved: boolean;
  daysCount: number;
  itemsCount: number;
  createdAt: string;
  updatedAt: string;
}

export const LOCATION_TYPES: readonly LocationType[] = [
  'attraction',
  'museum',
  'restaurant',
  'cafe',
  'hotel',
  'park',
  'shopping',
  'nightlife',
  'transport_hub',
  'other',
];

export const TRANSPORT_MODES: readonly TransportMode[] = [
  'walk',
  'bike',
  'car',
  'taxi',
  'bus',
  'metro',
  'train',
  'ferry',
  'plane',
];

/** Тело запроса POST /api/trips/generate. */
export interface GenerateTripRequest {
  /** Город назначения. */
  destination: string;
  /** Количество дней (1–14). */
  durationDays: number;
  /** Интересы пользователя в свободной форме. */
  preferences?: string;
}

export interface UpdateTripRequest {
  title?: string;
  saved?: boolean;
}

export interface ApiError {
  error: string;
}
