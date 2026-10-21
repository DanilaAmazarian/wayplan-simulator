import { Component, inject, input, output, signal } from '@angular/core';
import { TuiButton, TuiIcon } from '@taiga-ui/core';
import { TuiSkeleton } from '@taiga-ui/kit';
import type { TripSummary } from '@travel/shared';
import { I18n } from '../../../../core/i18n/i18n';
import { countLabel, fill } from '../../lib/format';

@Component({
  selector: 'app-saved-trips',
  imports: [TuiButton, TuiIcon, TuiSkeleton],
  templateUrl: './saved-trips.html',
  styleUrl: './saved-trips.scss',
})
export class SavedTrips {
  protected readonly i18n = inject(I18n);
  /** `null` — список ещё загружается. */
  readonly trips = input<TripSummary[] | null>(null);
  readonly openTrip = output<string>();
  readonly deleteTrip = output<string>();

  protected readonly confirmId = signal<string | null>(null);

  protected formatSavedAt(iso: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'short' }).format(new Date(iso));
  }

  protected days(count: number): string {
    return countLabel(this.i18n.locale(), count, this.i18n.messages().units.day);
  }

  protected points(count: number): string {
    return countLabel(this.i18n.locale(), count, this.i18n.messages().units.point);
  }

  protected deleteLabel(title: string): string {
    return fill(this.i18n.messages().savedTrips.deleteNamed, { title });
  }

  protected askDelete(id: string): void {
    this.confirmId.set(id);
  }

  protected confirmDelete(id: string): void {
    this.confirmId.set(null);
    this.deleteTrip.emit(id);
  }
}
