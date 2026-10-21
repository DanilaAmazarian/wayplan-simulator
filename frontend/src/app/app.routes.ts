import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { TripApi } from './pages/planner/data/trip.api';
import { PlannerStore } from './pages/planner/state/planner.store';

export const routes: Routes = [
  {
    path: 's/:token',
    loadComponent: () => import('./pages/share/share.page').then((module) => module.SharePage),
    providers: [TripApi],
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/auth.page').then((module) => module.AuthPage),
  },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/planner/planner.page').then((module) => module.PlannerPage),
    providers: [TripApi, PlannerStore],
  },
];
