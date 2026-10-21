import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_BASE_URL } from './api-url';

/** Cookie сессии уходит только на наш API. */
export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  const apiUrl = inject(API_BASE_URL);
  if (!req.url.startsWith(apiUrl)) return next(req);
  return next(req.clone({ withCredentials: true }));
};
