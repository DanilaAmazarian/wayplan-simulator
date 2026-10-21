import type { LocationType } from '@travel/shared';

/** Почему точку нельзя оставлять в маршруте. */
export type PlaceDropReason = 'fast_food' | 'closed' | 'mall' | 'hardware';

const FAST_FOOD = [
  'ростикс',
  'rostic',
  'kfc',
  'макдональд',
  'mcdonald',
  'бургер кинг',
  'burger king',
  'вкусно и точка',
  'subway',
  'сабвей',
  'хесбургер',
  'hesburger',
  'кфс',
  'фудкорт',
  'food court',
];

const HARDWARE_SHOPS = new Set(['doityourself', 'hardware', 'trade', 'wholesale', 'building_supplies']);

export const MEAL_TYPES = new Set<LocationType>(['restaurant', 'cafe']);

export function isMealType(type: LocationType): boolean {
  return MEAL_TYPES.has(type);
}

const TYPE_HINTS: Partial<Record<LocationType, readonly string[]>> = {
  museum: ['museum', 'gallery', 'arts_centre'],
  attraction: ['attraction', 'museum', 'viewpoint', 'artwork', 'monument', 'memorial', 'castle', 'ruins'],
  park: ['park', 'garden', 'nature_reserve'],
  restaurant: ['restaurant'],
  cafe: ['cafe', 'restaurant'],
  hotel: ['hotel', 'guest_house', 'hostel'],
  nightlife: ['bar', 'pub', 'nightclub', 'biergarten'],
  shopping: ['marketplace', 'mall', 'department_store'],
};

const SIGHT_TYPES = new Set<LocationType>(['museum', 'attraction', 'park']);
const NOT_A_SIGHT = new Set(['hotel', 'office', 'school', 'music_school', 'ferry_terminal', 'government', 'fast_food']);

/**
 * Из нескольких одноимённых мест выбирает известное, а не гостиницу или школу с тем же названием.
 * Точное имя маленькой точки не проигрывает знаменитому месту, если имена лишь частично пересекаются.
 */
export function placeRankScore(input: {
  queryName: string;
  candidateName: string;
  importance: number;
  category: string;
  type: string;
  locationType: LocationType;
}): number {
  const name = nameScore(input.queryName, input.candidateName);
  const hints = TYPE_HINTS[input.locationType] ?? [];
  const fits = hints.includes(input.type) || hints.includes(input.category);
  const famous = input.importance >= 0.15 && name >= 0.8 ? 0.5 + input.importance : 0;
  const penalty = SIGHT_TYPES.has(input.locationType) && (NOT_A_SIGHT.has(input.type) || input.category === 'office') ? 0.35 : 0;
  return name + famous + (fits ? 0.1 : 0) - penalty;
}

/** Сравнение имён места: нижний регистр, без ё/ъ/ь и знаков. */
export function normalizePlaceName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[ъь]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-zа-я0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 1 — то же имя, 0.9 — одно содержится в другом, иначе доля общих слов запроса.
 * Короткие слова вроде «на» и «ул» не считаются.
 */
export function nameScore(query: string, candidate: string): number {
  const left = normalizePlaceName(query);
  const right = normalizePlaceName(candidate);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (right.includes(left) || left.includes(right)) return 0.9;
  const tokens = (value: string) => value.split(' ').filter((word) => word.length > 2);
  const queryTokens = tokens(left);
  const candidateTokens = new Set(tokens(right));
  if (queryTokens.length === 0 || candidateTokens.size === 0) return 0;
  const hits = queryTokens.filter((token) => candidateTokens.has(token)).length;
  return hits / queryTokens.length;
}

function hasToken(name: string, token: string): boolean {
  return normalizePlaceName(name).split(' ').includes(token);
}

/**
 * Пользователь прямо попросил то, что обычно выкидываем.
 * Закрытые площадки и стройки не возвращаем даже по просьбе.
 */
export function requestedPlaceKinds(preferences: string | undefined): Set<PlaceDropReason> {
  const text = normalizePlaceName(preferences ?? '');
  const allowed = new Set<PlaceDropReason>();
  if (!text) return allowed;
  if (/фастфуд|ростикс|kfc|макдон|бургер|фудкорт/.test(text)) allowed.add('fast_food');
  const tokens = text.split(' ');
  if (tokens.some((token) => token === 'тц' || token === 'трц' || token === 'трк' || token === 'mall' || token === 'shopping')) {
    allowed.add('mall');
  }
  if (/торгов\S*\s+центр/.test(text) || text.includes('шопинг') || text.includes('шоппинг')) allowed.add('mall');
  return allowed;
}

/** Имя уже выдаёт фастфуд, ТЦ, строймагазин или закрытую площадку — геокодер не нужен. */
export function unwantedName(name: string): PlaceDropReason | null {
  const normalized = normalizePlaceName(name);
  if (FAST_FOOD.some((brand) => normalized.includes(normalizePlaceName(brand)))) return 'fast_food';
  if (/закрыт|на реконструкции|строящ/.test(normalized)) return 'closed';
  if (/леруа|leroy|петрович|касторам|castorama|строительн/.test(normalized)) return 'hardware';
  if (
    ['тц', 'трц', 'трк', 'mall'].some((token) => hasToken(name, token)) ||
    normalized.includes('торговый центр') ||
    normalized.includes('торгово развлекательн')
  ) {
    return 'mall';
  }
  return null;
}

export interface OsmPlaceTags {
  category: string;
  type: string;
  extratags: Record<string, string>;
  locationType: LocationType;
  name: string;
}

/** Теги OSM: закрыто, стройка, фастфуд, строймаркет. ТЦ отсекаем только у точек типа shopping. */
export function osmDropReason(place: OsmPlaceTags): PlaceDropReason | null {
  const tags = place.extratags;
  const hours = (tags.opening_hours ?? '').trim().toLowerCase();
  const closedByKey = Object.keys(tags).some((key) => /^(disused|abandoned|demolished|construction)(:|$)/.test(key));
  const closed =
    closedByKey ||
    place.category === 'construction' ||
    place.type === 'construction' ||
    hours === 'closed' ||
    hours === 'off' ||
    hours === 'shutdown';
  if (closed) return 'closed';

  if (place.type === 'fast_food' || tags.amenity === 'fast_food') return 'fast_food';
  if (HARDWARE_SHOPS.has(place.type) || (tags.shop !== undefined && HARDWARE_SHOPS.has(tags.shop))) return 'hardware';

  if (place.locationType === 'shopping' && (place.type === 'mall' || tags.shop === 'mall' || unwantedName(place.name) === 'mall')) {
    return 'mall';
  }
  return null;
}

export interface OsmAddressParts {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  square?: string;
}

/** Улица и дом из ответа Nominatim. Нет улицы — null, чтобы не оставить выдуманный адрес модели. */
export function formatOsmAddress(address: OsmAddressParts | undefined): string | null {
  if (!address) return null;
  const road = address.road || address.pedestrian || address.square || address.footway;
  if (!road) return null;
  return address.house_number ? `${road}, ${address.house_number}` : road;
}

/** Улица из адреса модели и улица OSM — одно и то же место, даже если имя чуть разъехалось. */
export function roadMatches(modelAddress: string, road: string | null): boolean {
  if (!road) return false;
  const address = normalizePlaceName(modelAddress);
  const street = normalizePlaceName(road);
  if (!address || !street) return false;
  return address.includes(street) || street.includes(address);
}
