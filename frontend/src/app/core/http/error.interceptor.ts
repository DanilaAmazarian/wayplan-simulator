import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { I18n } from '../i18n/i18n';
import { fill } from '../i18n/text';
import { ApiRequestError } from './api-error';
import { API_BASE_URL } from './api-url';

export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const apiUrl = inject(API_BASE_URL);
  const i18n = inject(I18n);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) return throwError(() => error);
      const text = i18n.messages();
      if (error.status === 0) {
        return throwError(() => new ApiRequestError(fill(text.errors.backendDown, { url: apiUrl }), 0));
      }
      const body = error.error as { error?: string } | string | null;
      const message = typeof body === 'string' ? body : body?.error;
      return throwError(() => new ApiRequestError(message || fill(text.errors.requestFailed, { status: error.status }), error.status));
    }),
  );
};
