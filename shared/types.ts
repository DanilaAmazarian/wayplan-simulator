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

/** Остановка общественного транспорта. */
export interface TransitStop {
  name: string;
  coordinates: Coordinates;
}

/**
 * Как проехать плечо на метро, поезде, пароме или самолёте.
 * `ride` — есть вход и выход. `same-stop` — обе точки у одной остановки, ехать не нужно.
 * `unavailable` — расписание не нашло остановок.
 */
export interface TransitRide {
  status: 'ride' | 'same-stop' | 'unavailable';
  board?: TransitStop;
  alight?: TransitStop;
  /** Короткое имя линии, если оно одно на всю поездку. */
  line?: string;
  transfers?: TransitStop[];
}

/** Кусок плеча: подход по улицам или сама поездка. */
export interface RouteSegment {
  kind: 'street' | 'transit';
  geometry?: Coordinates[];
  /** Номер линии для транзитного куска. */
  label?: string;
}

/** Отрезок пути между двумя соседними точками дня (для Polyline на карте). */
export interface Route {
  from: Coordinates;
  to: Coordinates;
  transport: TransportMode;
  distanceKm?: number;
  durationMin?: number;
  /** Вершины пути по дорогам. Нет поля — на карте прямая между from и to. */
  geometry?: Coordinates[];
  ride?: TransitRide;
  /** Если есть, карта рисует их по очереди вместо одного geometry. */
  segments?: RouteSegment[];
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
  /** Язык, на котором сгенерированы тексты и запрашиваются названия станций. */
  locale: Locale;
  /**
   * `true` — ответ владельцу. `false` — поездка без владельца, только просмотр.
   * В публичной ссылке поля нет.
   */
  owned?: boolean;
  /**
   * Активный токен публичной ссылки. Поле есть только в ответах владельца.
   * `null` — ссылки нет. Публичный просмотр по `/api/share/:token` поле не отдаёт.
   */
  shareToken?: string | null;
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

/** Языки интерфейса и новых маршрутов. Новый язык добавляется сюда и в словари. */
export const LOCALES = ['ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Тело запроса POST /api/trips/generate. */
export interface GenerateTripRequest {
  /** Город назначения. */
  destination: string;
  /** Количество дней (1–14). */
  durationDays: number;
  /** Интересы пользователя в свободной форме. */
  preferences?: string;
  /** Язык текстов маршрута. Нет поля — сервер принимает русский. */
  locale?: Locale;
}

export interface UpdateTripRequest {
  title?: string;
  saved?: boolean;
}

/** Ответ POST /api/trips/:id/share. Повторный запрос возвращает тот же активный токен. */
export interface ShareLinkResponse {
  token: string;
}

export interface ApiError {
  error: string;
}

/** Текущий пользователь. Пароль наружу не отдаётся. */
export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}
