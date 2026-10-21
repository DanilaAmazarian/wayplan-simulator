import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { TuiLoader } from '@taiga-ui/core';
import { TuiSkeleton } from '@taiga-ui/kit';
import { I18n } from '../../../../core/i18n/i18n';

@Component({
  selector: 'app-trip-skeleton',
  imports: [TuiLoader, TuiSkeleton],
  templateUrl: './trip-skeleton.html',
  styleUrl: './trip-skeleton.scss',
})
export class TripSkeleton {
  private readonly i18n = inject(I18n);
  protected readonly stage = signal(0);
  protected readonly stages = computed(() => {
    const text = this.i18n.messages().skeleton;
    return [text.places, text.schedule, text.geocode, text.order];
  });
  protected readonly placeholders = [0, 1, 2];

  constructor() {
    const timer = setInterval(() => this.stage.update((value) => Math.min(value + 1, this.stages().length - 1)), 6000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
