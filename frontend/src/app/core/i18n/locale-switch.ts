import { Component, inject } from '@angular/core';
import { LOCALES, type Locale } from '@travel/shared';
import { I18n } from './i18n';

@Component({
  selector: 'app-locale-switch',
  template: `
    <div class="switch" role="group" [attr.aria-label]="i18n.messages().locale.label">
      @for (code of codes; track code) {
        <button
          type="button"
          [class.active]="i18n.locale() === code"
          [attr.aria-pressed]="i18n.locale() === code"
          (click)="i18n.use(code)"
        >
          {{ code }}
        </button>
      }
    </div>
  `,
  styleUrl: './locale-switch.scss',
})
export class LocaleSwitch {
  protected readonly i18n = inject(I18n);
  protected readonly codes: readonly Locale[] = LOCALES;
}
