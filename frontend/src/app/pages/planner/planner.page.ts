import { afterNextRender, Component, DestroyRef, inject, signal } from '@angular/core';
import { TuiButton, TuiIcon, TuiScrollbar } from '@taiga-ui/core';
import { I18n } from '../../core/i18n/i18n';
import { LocaleSwitch } from '../../core/i18n/locale-switch';
import { PlannerStore } from './state/planner.store';
import { DayTimeline } from './ui/day-timeline/day-timeline';
import { EditableTitle } from './ui/editable-title/editable-title';
import { SavedTrips } from './ui/saved-trips/saved-trips';
import { TripForm } from './ui/trip-form/trip-form';
import { TripMap } from './ui/trip-map/trip-map';
import { TripSkeleton } from './ui/trip-skeleton/trip-skeleton';

type MobilePanel = 'route' | 'map';

@Component({
  selector: 'app-planner',
  imports: [TuiButton, TuiIcon, TuiScrollbar, LocaleSwitch, DayTimeline, EditableTitle, SavedTrips, TripForm, TripMap, TripSkeleton],
  templateUrl: './planner.page.html',
  styleUrl: './planner.page.scss',
})
export class PlannerPage {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(PlannerStore);
  protected readonly i18n = inject(I18n);
  protected readonly panel = signal<MobilePanel>('route');
  private readonly mobile = signal(false);

  constructor() {
    afterNextRender(() => {
      const query = window.matchMedia('(max-width: 767px)');
      const sync = () => this.mobile.set(query.matches);
      sync();
      query.addEventListener('change', sync);
      this.destroyRef.onDestroy(() => query.removeEventListener('change', sync));
    });
  }

  protected showPanel(panel: MobilePanel): void {
    this.panel.set(panel);
  }

  protected pickItem(id: string): void {
    this.store.selectItem(id);
    this.panel.set('map');
  }

  protected startNew(): void {
    this.panel.set('route');
    this.store.reset();
  }
}
