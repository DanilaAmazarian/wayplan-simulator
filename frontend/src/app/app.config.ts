import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, computed, inject, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTaiga } from '@taiga-ui/core';
import { TUI_ENGLISH_LANGUAGE, TUI_LANGUAGE, TUI_RUSSIAN_LANGUAGE } from '@taiga-ui/i18n';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { credentialsInterceptor } from './core/http/credentials.interceptor';
import { apiErrorInterceptor } from './core/http/error.interceptor';
import { API_BASE_URL } from './core/http/api-url';
import { I18n } from './core/i18n/i18n';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([credentialsInterceptor, apiErrorInterceptor])),
    provideTaiga(),
    {
      provide: TUI_LANGUAGE,
      useFactory: () => {
        const i18n = inject(I18n);
        return computed(() => (i18n.locale() === 'ru' ? TUI_RUSSIAN_LANGUAGE : TUI_ENGLISH_LANGUAGE));
      },
    },
    { provide: API_BASE_URL, useValue: environment.apiUrl },
  ],
};
