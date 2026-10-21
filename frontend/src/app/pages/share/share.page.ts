import { afterNextRender, Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TuiButton, TuiIcon, TuiScrollbar } from '@taiga-ui/core';
import type { Trip } from '@travel/shared';
import { map } from 'rxjs';
import { I18n } from '../../core/i18n/i18n';
import { LocaleSwitch } from '../../core/i18n/locale-switch';
import { ApiRequestError } from '../../core/http/api-error';
import { TripApi } from '../planner/data/trip.api';
import { DayTimeline } from '../planner/ui/day-timeline/day-timeline';
import { TripMap } from '../planner/ui/trip-map/trip-map';
import { TripSkeleton } from '../planner/ui/trip-skeleton/trip-skeleton';

type MobilePanel = 'route' | 'map';
type ShareFailure = 'invalid' | 'open';

@Component({
  selector: 'app-share',
  imports: [RouterLink, TuiButton, TuiIcon, TuiScrollbar, LocaleSwitch, DayTimeline, TripMap, TripSkeleton],
  templateUrl: './share.page.html',
  styleUrl: './share.page.scss',
})
export class SharePage {
  private readonly api = inject(TripApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(I18n);

  protected readonly trip = signal<Trip | null>(null);
  protected readonly panel = signal<MobilePanel>('route');
  private readonly mobile = signal(false);
  protected readonly loading = signal(true);
  private readonly failure = signal<ShareFailure | null>(null);
  private readonly serverError = signal<string | null>(null);
  protected readonly errorText = computed(() => {
    const text = this.i18n.messages().share;
    if (this.failure() === 'invalid') return text.invalid;
    if (this.failure() === 'open') return text.openFailed;
    return this.serverError();
  });
  protected readonly activeDay = signal(1);
  protected readonly selectedItemId = signal<string | null>(null);

  private readonly token = toSignal(this.route.paramMap.pipe(map((params) => params.get('token'))), {
    initialValue: this.route.snapshot.paramMap.get('token'),
  });

  protected readonly currentDay = computed(() => {
    const trip = this.trip();
    if (!trip) return undefined;
    return trip.days.find((day) => day.dayNumber === this.activeDay()) ?? trip.days[0];
  });

  constructor() {
    afterNextRender(() => {
      const query = window.matchMedia('(max-width: 767px)');
      const sync = () => this.mobile.set(query.matches);
      sync();
      query.addEventListener('change', sync);
      this.destroyRef.onDestroy(() => query.removeEventListener('change', sync));
    });

    effect(() => {
      const token = this.token();
      if (!token) {
        this.loading.set(false);
        this.trip.set(null);
        this.failure.set('invalid');
        this.serverError.set(null);
        return;
      }
      untracked(() => {
        void this.load(token);
      });
    });
  }

  protected dates(trip: Trip): string {
    const format = new Intl.DateTimeFormat(this.i18n.locale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const start = format.format(new Date(`${trip.startDate}T00:00:00.000Z`));
    const end = format.format(new Date(`${trip.endDate}T00:00:00.000Z`));
    return trip.destination + (start === end ? ` · ${start}` : ` · ${start} — ${end}`);
  }

  protected inertPanel(panel: MobilePanel): boolean {
    if (!this.mobile()) return false;
    if (!this.trip()) return panel === 'map';
    return this.panel() !== panel;
  }

  protected showPanel(panel: MobilePanel): void {
    this.panel.set(panel);
  }

  protected setActiveDay(dayNumber: number): void {
    this.activeDay.set(dayNumber);
    this.selectedItemId.set(null);
  }

  protected selectItem(id: string): void {
    this.selectedItemId.set(id);
    this.panel.set('map');
  }

  private async load(token: string): Promise<void> {
    this.loading.set(true);
    this.failure.set(null);
    this.serverError.set(null);
    this.panel.set('route');
    this.trip.set(null);
    try {
      const trip = await this.api.getShared(token);
      if (this.token() !== token) return;
      this.trip.set(trip);
      this.activeDay.set(trip.days[0]?.dayNumber ?? 1);
      this.selectedItemId.set(null);
    } catch (error) {
      if (this.token() !== token) return;
      this.trip.set(null);
      if (error instanceof ApiRequestError) this.serverError.set(error.message);
      else this.failure.set('open');
    } finally {
      if (this.token() === token) this.loading.set(false);
    }
  }
}
