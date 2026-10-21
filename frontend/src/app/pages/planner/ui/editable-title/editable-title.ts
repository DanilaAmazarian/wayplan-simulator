import { Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { TuiIcon } from '@taiga-ui/core';
import { I18n } from '../../../../core/i18n/i18n';

const MAX_TITLE_LENGTH = 120;

@Component({
  selector: 'app-editable-title',
  imports: [TuiIcon],
  templateUrl: './editable-title.html',
  styleUrl: './editable-title.scss',
})
export class EditableTitle {
  protected readonly i18n = inject(I18n);
  readonly value = input.required<string>();
  readonly save = output<string>();

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  protected readonly editing = signal(false);
  protected readonly draft = signal('');
  private finished = false;

  protected readonly maxLength = MAX_TITLE_LENGTH;

  protected startEditing(): void {
    this.finished = false;
    this.draft.set(this.value());
    this.editing.set(true);
    setTimeout(() => this.inputRef()?.nativeElement.focus());
  }

  protected finish(save: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.editing.set(false);
    const title = this.draft().trim();
    if (save && title && title !== this.value()) this.save.emit(title);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.finish(true);
    if (event.key === 'Escape') this.finish(false);
  }
}
