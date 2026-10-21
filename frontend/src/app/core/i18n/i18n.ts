import { Injectable, computed, effect, signal } from '@angular/core';
import { isLocale, type Locale } from '@travel/shared';
import { MESSAGES } from './messages';

const STORAGE_KEY = 'travel.locale';

function storedLocale(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function browserLocale(): Locale {
  const language = navigator.language?.toLowerCase() ?? '';
  if (language.startsWith('en')) return 'en';
  if (language.startsWith('ru')) return 'ru';
  return 'ru';
}

@Injectable({ providedIn: 'root' })
export class I18n {
  readonly locale = signal<Locale>(storedLocale() ?? browserLocale());
  readonly messages = computed(() => MESSAGES[this.locale()]);

  constructor() {
    effect(() => {
      document.documentElement.lang = this.locale();
    });
  }

  use(locale: Locale): void {
    this.locale.set(locale);
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Приватный режим не даёт записать выбор. Язык всё равно живёт до перезагрузки.
    }
  }
}
