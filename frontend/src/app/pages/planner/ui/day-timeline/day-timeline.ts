import { Component, computed, inject, input, output } from '@angular/core';
import { TuiIcon } from '@taiga-ui/core';
import { TuiBadge, TuiTabs } from '@taiga-ui/kit';
import type { DayPlan, ItineraryItem, TransportMode, Trip } from '@travel/shared';
import { I18n } from '../../../../core/i18n/i18n';
import { countLabel, fill } from '../../lib/format';
import { LOCATION_TYPE_META, TRANSPORT_META, dayColor } from '../../lib/labels';

@Component({
  selector: 'app-day-timeline',
  imports: [TuiIcon, TuiBadge, TuiTabs],
  templateUrl: './day-timeline.html',
  styleUrl: './day-timeline.scss',
})
export class DayTimeline {
  protected readonly i18n = inject(I18n);
  readonly trip = input.required<Trip>();
  readonly activeDay = input.required<number>();
  readonly selectedItemId = input<string | null>(null);
  readonly dayChange = output<number>();
  readonly itemSelect = output<string>();

  protected readonly activeIndex = computed(() => {
    const index = this.trip().days.findIndex((day) => day.dayNumber === this.activeDay());
    return index < 0 ? 0 : index;
  });

  protected readonly current = computed(() => this.trip().days[this.activeIndex()]);

  protected color(dayNumber: number): string {
    return dayColor(dayNumber);
  }

  protected dayTitle(dayNumber: number): string {
    return fill(this.i18n.messages().timeline.day, { n: dayNumber });
  }

  /** `day.date` — календарная дата "YYYY-MM-DD", `new Date` разбирает её как полночь UTC. */
  protected dateLabel(date: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(date));
  }

  protected pointLabel(count: number): string {
    return countLabel(this.i18n.locale(), count, this.i18n.messages().units.point);
  }

  protected totalKm(day: DayPlan): number {
    return (day.routes ?? []).reduce((sum, route) => sum + (route.distanceKm ?? 0), 0);
  }

  protected geocodedCount(day: DayPlan): number {
    return day.items.filter((item) => item.location.geocoded).length;
  }

  protected meta(item: ItineraryItem) {
    const visual = LOCATION_TYPE_META[item.location.type] ?? LOCATION_TYPE_META.other;
    const label = this.i18n.messages().locationType[item.location.type] ?? this.i18n.messages().locationType.other;
    return { ...visual, label };
  }

  protected legText(day: DayPlan, index: number): string {
    const item = day.items[index];
    if (!item) return '';
    const emoji = TRANSPORT_META[item.transport].emoji;
    const label = this.transportLabel(item.transport);
    const text = this.i18n.messages().leg;
    const route = day.routes?.[index - 1];
    const ride = route?.ride;

    if (ride?.status === 'unavailable') return `${emoji} ${label} · ${text.stationsMissing}`;

    if (ride?.status === 'same-stop') {
      const name = ride.board?.name;
      const detail = name ? fill(text.sameStopNamed, { name }) : text.sameStopWalk;
      return `${emoji} ${label} ${detail}`;
    }

    if (ride?.status === 'ride') {
      const parts = [`${emoji} ${label}`];
      if (ride.line) parts.push(fill(text.line, { name: ride.line }));
      if (ride.board) parts.push(fill(text.board, { name: ride.board.name }));
      for (const stop of ride.transfers ?? []) parts.push(fill(text.transfer, { name: stop.name }));
      if (ride.alight) parts.push(fill(text.alight, { name: ride.alight.name }));
      if (route?.durationMin) parts.push(fill(text.minutes, { n: route.durationMin }));
      return parts.join(' · ');
    }

    const km = route?.distanceKm;
    return `${emoji} ${label}${km != null ? ` · ${km.toFixed(1)} ${this.i18n.messages().units.km}` : ''}`;
  }

  private transportLabel(mode: TransportMode): string {
    return this.i18n.messages().transport[mode];
  }

  protected onIndexChange(index: number): void {
    const day = this.trip().days[index];
    if (day) this.dayChange.emit(day.dayNumber);
  }

  protected onCardKey(event: KeyboardEvent, id: string): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.itemSelect.emit(id);
  }
}
