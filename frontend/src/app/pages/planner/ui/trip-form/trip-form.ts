import { Component, inject, input, output, signal } from '@angular/core';
import { disabled, form, FormField, max, maxLength, min, validate } from '@angular/forms/signals';
import { TuiButton, TuiIcon, TuiInput, TuiLabel, TuiTextfield } from '@taiga-ui/core';
import { TuiError } from '@taiga-ui/core/components/error';
import { TuiTextarea } from '@taiga-ui/kit';
import { TuiSlider } from '@taiga-ui/core';
import type { GenerateTripRequest } from '@travel/shared';
import { I18n } from '../../../../core/i18n/i18n';
import { countLabel } from '../../lib/format';

const MAX_DAYS = 14;

interface GenerateModel {
  destination: string;
  durationDays: number;
  preferences: string;
}

@Component({
  selector: 'app-trip-form',
  imports: [FormField, TuiButton, TuiError, TuiIcon, TuiInput, TuiLabel, TuiTextfield, TuiTextarea, TuiSlider],
  templateUrl: './trip-form.html',
  styleUrl: './trip-form.scss',
})
export class TripForm {
  readonly loading = input(false);
  readonly submitted = output<GenerateTripRequest>();
  readonly cancelled = output<void>();
  protected readonly i18n = inject(I18n);

  protected readonly maxDays = MAX_DAYS;
  protected readonly model = signal<GenerateModel>({
    destination: '',
    durationDays: 3,
    preferences: '',
  });

  protected readonly generateForm = form(this.model, (path) => {
    validate(path.destination, ({ value }) =>
      value().trim().length >= 2 ? undefined : { kind: 'destination', message: 'destination' },
    );
    min(path.durationDays, 1);
    max(path.durationDays, MAX_DAYS);
    maxLength(path.preferences, 1000, { message: 'maxLength' });
    const blocked = () => this.loading();
    disabled(path.destination, { when: blocked });
    disabled(path.preferences, { when: blocked });
  });

  protected dayLabel(): string {
    return countLabel(this.i18n.locale(), this.model().durationDays, this.i18n.messages().units.day);
  }

  protected destinationErrors(): Record<string, string> {
    return { destination: this.i18n.messages().validation.destination };
  }

  protected preferencesErrors(): Record<string, string> {
    return { maxLength: this.i18n.messages().validation.preferencesLong };
  }

  protected fieldError(
    field: { touched: () => boolean; errors: () => readonly { kind: string }[] },
    messages: Record<string, string>,
  ): string | null {
    if (!field.touched()) return null;
    const error = field.errors()[0];
    return error ? (messages[error.kind] ?? null) : null;
  }

  protected setDays(event: Event): void {
    const durationDays = Number((event.target as HTMLInputElement).value);
    this.model.update((current) => ({ ...current, durationDays }));
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.generateForm().markAsTouched();
    if (this.loading() || !this.generateForm().valid()) return;
    const value = this.model();
    this.submitted.emit({
      destination: value.destination.trim(),
      durationDays: value.durationDays,
      preferences: value.preferences.trim(),
    });
  }
}
