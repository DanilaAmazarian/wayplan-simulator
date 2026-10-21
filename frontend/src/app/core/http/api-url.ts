import { InjectionToken } from '@angular/core';

/** Базовый адрес API. Подмена значения — шов для сборки и будущего окружения. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');
