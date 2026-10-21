import { inject, Injectable, computed, effect, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TuiNotificationService } from '@taiga-ui/core';
import type { GenerateTripRequest, Trip, TripSummary, UpdateTripRequest } from '@travel/shared';
import { map } from 'rxjs';
import { safeReturnUrl } from '../../../core/auth/auth.guard';
import { Session } from '../../../core/auth/session';
import { ApiRequestError } from '../../../core/http/api-error';
import { I18n } from '../../../core/i18n/i18n';
import { AbortedRequestError, TripApi } from '../data/trip.api';
import { countLabel, fill } from '../lib/format';

function toSummary(trip: Trip): TripSummary {
  return {
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    saved: trip.saved,
    daysCount: trip.days.length,
    itemsCount: trip.days.reduce((count, day) => count + day.items.length, 0),
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}

@Injectable()
export class PlannerStore {
  private readonly api = inject(TripApi);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(TuiNotificationService);
  private readonly i18n = inject(I18n);

  readonly user = this.session.user;
  readonly authBusy = signal(false);
  readonly trip = signal<Trip | null>(null);
  /** День не сбрасывается при переименовании и сохранении: меняется только id поездки или явный выбор. */
  readonly activeDay = signal(1);
  readonly selectedItemId = signal<string | null>(null);
  /** `null` — список ещё загружается. */
  readonly savedTrips = signal<TripSummary[] | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly shareOpen = signal(false);
  readonly shareToken = signal<string | null>(null);
  readonly shareBusy = signal(false);

  /** Поездка из URL, которую не нужно загружать: загрузка упала или пользователь нажал «Новая». */
  private readonly skippedTripId = signal<string | null>(null);
  /** Живёт, пока идёт `POST /api/trips/generate`. Отмена обрывает и XHR, и вызов модели. */
  private generateController: AbortController | null = null;

  readonly tripIdFromUrl = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('trip'))), {
    initialValue: this.route.snapshot.queryParamMap.get('trip'),
  });

  readonly loadingFromUrl = computed(() => {
    const id = this.tripIdFromUrl();
    return !!this.user() && !!id && this.trip()?.id !== id && this.skippedTripId() !== id;
  });

  readonly currentDay = computed(() => {
    const trip = this.trip();
    if (!trip) return undefined;
    return trip.days.find((day) => day.dayNumber === this.activeDay()) ?? trip.days[0];
  });

  constructor() {
    void this.refreshSaved();
    effect(() => {
      const user = this.user();
      const id = this.tripIdFromUrl();
      const currentId = this.trip()?.id;
      const skipped = this.skippedTripId();
      if (!user || !id || currentId === id || skipped === id) return;
      untracked(() => {
        void this.loadTrip(id);
      });
    });
  }

  async logout(): Promise<void> {
    this.cancelGenerate();
    this.authBusy.set(true);
    try {
      await this.session.logout();
      this.trip.set(null);
      this.savedTrips.set(null);
      this.selectedItemId.set(null);
      this.clearShare();
      await this.router.navigate(['/login'], { replaceUrl: true });
    } catch (error) {
      this.showError(error, this.i18n.messages().toast.logoutFailed);
    } finally {
      this.authBusy.set(false);
    }
  }

  cancelGenerate(): void {
    this.generateController?.abort();
  }

  async generate(payload: GenerateTripRequest): Promise<void> {
    this.cancelGenerate();
    const controller = new AbortController();
    this.generateController = controller;
    this.loading.set(true);
    this.clearShare();
    try {
      const created = await this.api.generate({ ...payload, locale: this.i18n.locale() }, controller.signal);
      if (controller.signal.aborted) return;
      this.skippedTripId.set(null);
      this.trip.set(created);
      this.restoreShare(created, false);
      this.activeDay.set(created.days[0]?.dayNumber ?? 1);
      this.selectedItemId.set(null);
      await this.setTripQuery(created.id);
      const items = created.days.flatMap((day) => day.items);
      const geocoded = items.filter((item) => item.location.geocoded).length;
      const text = this.i18n.messages();
      this.notify(
        text.toast.ready,
        'positive',
        `${countLabel(this.i18n.locale(), created.days.length, text.units.day)}, ${countLabel(this.i18n.locale(), items.length, text.units.point)} · ${fill(text.toast.osmCoords, { geocoded, total: items.length })}`,
      );
    } catch (error) {
      if (error instanceof AbortedRequestError || controller.signal.aborted) {
        this.notify(this.i18n.messages().toast.cancelled, 'info');
        return;
      }
      this.showError(error, this.i18n.messages().toast.generateFailed);
    } finally {
      if (this.generateController === controller) {
        this.generateController = null;
        this.loading.set(false);
      }
    }
  }

  reset(): void {
    this.skippedTripId.set(this.tripIdFromUrl());
    this.trip.set(null);
    this.selectedItemId.set(null);
    this.clearShare();
    void this.setTripQuery(null);
  }

  openSaved(id: string): void {
    this.skippedTripId.set(null);
    this.selectedItemId.set(null);
    void this.setTripQuery(id);
  }

  async deleteSaved(id: string): Promise<void> {
    const previous = this.savedTrips();
    this.savedTrips.update((list) => list?.filter((trip) => trip.id !== id) ?? list);
    try {
      await this.api.delete(id);
      this.notify(this.i18n.messages().toast.deleted, 'positive');
    } catch (error) {
      this.savedTrips.set(previous);
      this.showError(error, this.i18n.messages().toast.deleteFailed);
    }
  }

  async toggleSaved(): Promise<void> {
    const trip = this.trip();
    if (!trip) return;
    this.saving.set(true);
    try {
      const updated = await this.patch({ saved: !trip.saved });
      const text = this.i18n.messages().toast;
      if (updated?.saved) this.notify(text.saved, 'positive', text.savedHint);
      else this.notify(text.unsaved, 'info');
    } catch (error) {
      this.showError(error, this.i18n.messages().toast.saveFailed);
    } finally {
      this.saving.set(false);
    }
  }

  async rename(title: string): Promise<void> {
    try {
      await this.patch({ title });
    } catch (error) {
      this.showError(error, this.i18n.messages().toast.renameFailed);
    }
  }

  setActiveDay(dayNumber: number): void {
    this.activeDay.set(dayNumber);
    this.selectedItemId.set(null);
  }

  selectItem(id: string): void {
    this.selectedItemId.set(id);
  }

  shareUrl(): string {
    const token = this.shareToken();
    if (!token) return '';
    return `${window.location.origin}/s/${token}`;
  }

  async toggleShare(): Promise<void> {
    if (this.shareOpen()) {
      this.shareOpen.set(false);
      return;
    }
    const trip = this.trip();
    if (!trip) return;
    this.shareOpen.set(true);
    if (this.shareToken()) return;

    this.shareBusy.set(true);
    try {
      const { token } = await this.api.createShare(trip.id);
      if (!this.shareOpen() || this.trip()?.id !== trip.id) return;
      this.shareToken.set(token);
      this.trip.update((current) => (current?.id === trip.id ? { ...current, shareToken: token } : current));
    } catch (error) {
      if (!this.shareOpen() || this.trip()?.id !== trip.id) return;
      this.shareOpen.set(false);
      this.showError(error, this.i18n.messages().toast.shareFailed);
    } finally {
      this.shareBusy.set(false);
    }
  }

  async copyShare(input: HTMLInputElement): Promise<void> {
    const url = this.shareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.notify(this.i18n.messages().toast.copied, 'positive');
    } catch {
      input.focus();
      input.select();
      this.notify(this.i18n.messages().toast.copyManual, 'info');
    }
  }

  async revokeShare(): Promise<void> {
    const trip = this.trip();
    if (!trip) return;
    this.shareBusy.set(true);
    try {
      await this.api.revokeShare(trip.id);
      if (this.trip()?.id !== trip.id) return;
      this.shareToken.set(null);
      this.shareOpen.set(false);
      this.trip.update((current) => (current?.id === trip.id ? { ...current, shareToken: null } : current));
      const text = this.i18n.messages().toast;
      this.notify(text.revoked, 'info', text.revokedHint);
    } catch (error) {
      this.showError(error, this.i18n.messages().toast.revokeFailed);
    } finally {
      this.shareBusy.set(false);
    }
  }

  private async loadTrip(id: string): Promise<void> {
    this.clearShare();
    try {
      const trip = await this.api.get(id);
      if (this.tripIdFromUrl() !== id || this.skippedTripId() === id) return;
      this.trip.set(trip);
      this.activeDay.set(trip.days[0]?.dayNumber ?? 1);
      this.selectedItemId.set(null);
      this.restoreShare(trip, true);
    } catch (error) {
      if (error instanceof AbortedRequestError || this.tripIdFromUrl() !== id) return;
      this.skippedTripId.set(id);
      this.showError(error, this.i18n.messages().toast.openFailed);
    }
  }

  private async refreshSaved(): Promise<void> {
    try {
      this.savedTrips.set(await this.api.listSaved());
    } catch (error) {
      this.savedTrips.set([]);
      this.showError(error, this.i18n.messages().toast.savedLoadFailed);
    }
  }

  private async patch(payload: UpdateTripRequest): Promise<Trip | null> {
    const trip = this.trip();
    if (!trip) return null;
    const updated = await this.api.update(trip.id, payload);
    this.trip.set(updated);
    this.restoreShare(updated, false);
    this.syncSavedList(updated);
    return updated;
  }

  /** `reveal` открывает панель, если ссылка уже есть — после перезагрузки её снова можно отозвать. */
  private restoreShare(trip: Trip, reveal: boolean): void {
    const token = trip.shareToken ?? null;
    this.shareToken.set(token);
    if (!token) this.shareOpen.set(false);
    else if (reveal) this.shareOpen.set(true);
  }

  private syncSavedList(updated: Trip): void {
    this.savedTrips.update((list) => {
      const rest = (list ?? []).filter((trip) => trip.id !== updated.id);
      return updated.saved ? [toSummary(updated), ...rest] : rest;
    });
  }

  private clearShare(): void {
    this.shareOpen.set(false);
    this.shareToken.set(null);
  }

  private setTripQuery(id: string | null): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { trip: id },
      replaceUrl: true,
    });
  }

  private showError(error: unknown, title: string): void {
    const description = error instanceof Error ? error.message : undefined;
    if (!(error instanceof ApiRequestError)) {
      this.notify(title, 'negative', description);
      return;
    }
    if (error.status === 401 && this.user()) {
      this.session.clear();
      this.trip.set(null);
      this.savedTrips.set(null);
      this.clearShare();
      this.notify(this.i18n.messages().toast.needLogin, 'warning', description);
      const returnUrl = safeReturnUrl(this.router.url);
      void this.router.navigate(['/login'], {
        replaceUrl: true,
        queryParams: returnUrl === '/' ? {} : { returnUrl },
      });
      return;
    }
    const text = this.i18n.messages().toast;
    if (error.status === 429) this.notify(text.rateLimit, 'negative', description, 10_000);
    else if (error.status === 0) this.notify(text.offline, 'negative', description);
    else if (error.status === 400) this.notify(text.checkData, 'warning', description);
    else this.notify(title, 'negative', description);
  }

  private notify(title: string, appearance: 'positive' | 'negative' | 'warning' | 'info', description?: string, autoClose = 3000): void {
    this.notifications.open(description ?? title, { label: description ? title : '', appearance, autoClose }).subscribe();
  }
}
