import type { Locale } from '@travel/shared';

const OUTPUT_LANGUAGE: Record<Locale, string> = {
  ru: 'русском',
  en: 'английском',
};

/** Название языка для промпта. Новый язык добавляется сюда и в фразы ниже. */
export function outputLanguage(locale: Locale): string {
  return OUTPUT_LANGUAGE[locale];
}

export function dayTitle(locale: Locale, day: number): string {
  return locale === 'en' ? `Day ${day}` : `День ${day}`;
}

export function fallbackTitle(locale: Locale, destination: string, days: number): string {
  return locale === 'en' ? `${destination}: ${days} d` : `${destination}: ${days} дн.`;
}

export function mockTitle(locale: Locale, destination: string, days: number): string {
  return locale === 'en' ? `${destination}: demo route, ${days} d` : `${destination}: демо-маршрут на ${days} дн.`;
}
