import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Session } from './session';

/** Локальный адрес после входа. Чужие и внешние адреса отбрасываются. */
export function safeReturnUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  const path = value.split(/[?#]/, 1)[0];
  if (path === '/login') return '/';
  return value;
}

export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(Session);
  const router = inject(Router);
  const user = await session.ensure();
  if (user) return true;
  return router.createUrlTree(['/login'], {
    queryParams: state.url !== '/' ? { returnUrl: state.url } : {},
  });
};

export const guestGuard: CanActivateFn = async (route) => {
  const session = inject(Session);
  const router = inject(Router);
  const user = await session.ensure();
  if (!user) return true;
  return router.parseUrl(safeReturnUrl(route.queryParamMap.get('returnUrl')));
};
