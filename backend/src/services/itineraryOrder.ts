import type { Coordinates } from '@travel/shared';
import { nearestNeighborOrder } from './geo.js';
import type { GeneratedItem } from './openai.js';
import { isMealType } from './placeQuality.js';

function coords(item: GeneratedItem): Coordinates {
  return item.location;
}

/**
 * Обеды и ужины остаются в своём месте дня.
 * Ближайший сосед переставляет только прогулки между ними, чтобы две еды не склеились.
 */
function orderAroundMeals(items: GeneratedItem[]): GeneratedItem[] {
  const result: GeneratedItem[] = [];
  let sights: GeneratedItem[] = [];

  const flush = () => {
    if (sights.length === 0) return;
    if (result.length === 0) {
      result.push(...nearestNeighborOrder(sights, coords));
    } else {
      const anchor = result[result.length - 1]!;
      result.push(...nearestNeighborOrder([anchor, ...sights], coords).slice(1));
    }
    sights = [];
  };

  for (const item of items) {
    if (isMealType(item.location.type)) {
      flush();
      result.push(item);
    } else {
      sights.push(item);
    }
  }
  flush();
  return result;
}

/** Если модель всё же поставила две еды подряд, между ними встаёт ближайшая прогулка. */
function separateAdjacentMeals(items: GeneratedItem[]): GeneratedItem[] {
  const result = [...items];
  for (let index = 0; index < result.length - 1; index += 1) {
    if (!isMealType(result[index]!.location.type) || !isMealType(result[index + 1]!.location.type)) continue;

    let later = -1;
    for (let cursor = index + 2; cursor < result.length; cursor += 1) {
      if (!isMealType(result[cursor]!.location.type)) {
        later = cursor;
        break;
      }
    }
    if (later !== -1) {
      const [sight] = result.splice(later, 1);
      result.splice(index + 1, 0, sight!);
      continue;
    }

    let earlier = -1;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (!isMealType(result[cursor]!.location.type)) {
        earlier = cursor;
        break;
      }
    }
    if (earlier !== -1) {
      const [sight] = result.splice(earlier, 1);
      result.splice(index, 0, sight!);
      continue;
    }

    result.splice(index + 1, 1);
    index -= 1;
  }
  return result;
}

/**
 * Переупорядочивает точки дня по географической близости.
 * Временные слоты модели сохраняются и раздаются точкам в новом порядке.
 * Места еды не сдвигаются друг к другу.
 */
export function optimizeDay(items: GeneratedItem[]): GeneratedItem[] {
  const chronological = [...items].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const slots = chronological.map(({ startTime, endTime }) => ({ startTime, endTime }));
  const ordered = separateAdjacentMeals(orderAroundMeals(chronological));

  return ordered.map((item, index) => ({
    ...item,
    ...(slots[index] ?? { startTime: item.startTime, endTime: item.endTime }),
    transport: index === 0 ? 'walk' : item.transport,
  }));
}
