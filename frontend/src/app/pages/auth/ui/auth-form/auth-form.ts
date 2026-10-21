import { Component, inject, input, output, signal } from '@angular/core';
import { disabled, form, FormField, maxLength, minLength, required, validate } from '@angular/forms/signals';
import { TuiButton, TuiInput, TuiLabel, TuiTextfield } from '@taiga-ui/core';
import { TuiError } from '@taiga-ui/core/components/error';
import { I18n } from '../../../../core/i18n/i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthSubmit {
  mode: 'login' | 'register';
  email: string;
  password: string;
  name?: string;
}

interface AuthModel {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
}

@Component({
  selector: 'app-auth-form',
  imports: [FormField, TuiButton, TuiError, TuiInput, TuiLabel, TuiTextfield],
  templateUrl: './auth-form.html',
  styleUrl: './auth-form.scss',
})
export class AuthForm {
  readonly busy = input(false);
  readonly submitted = output<AuthSubmit>();
  protected readonly i18n = inject(I18n);

  protected readonly mode = signal<AuthSubmit['mode']>('login');
  protected readonly passwordVisible = signal(false);
  protected readonly confirmVisible = signal(false);
  protected readonly model = signal<AuthModel>({ email: '', password: '', confirmPassword: '', name: '' });

  protected readonly authForm = form(this.model, (path) => {
    required(path.email, { message: 'required' });
    validate(path.email, ({ value }) => {
      const email = value().trim();
      if (!email || EMAIL_RE.test(email)) return undefined;
      return { kind: 'email', message: 'email' };
    });
    required(path.password, { message: 'required' });
    minLength(path.password, 8, { message: 'minLength' });
    maxLength(path.password, 200, { message: 'maxLength' });
    validate(path.confirmPassword, ({ value }) => {
      if (this.mode() !== 'register') return undefined;
      const confirm = value();
      if (!confirm) return { kind: 'required', message: 'required' };
      if (confirm !== this.model().password) return { kind: 'mismatch', message: 'mismatch' };
      return undefined;
    });
    maxLength(path.name, 80, { message: 'maxLength' });
    const blocked = () => this.busy();
    disabled(path.email, { when: blocked });
    disabled(path.password, { when: blocked });
    disabled(path.confirmPassword, { when: blocked });
    disabled(path.name, { when: blocked });
  });

  protected switchMode(mode: AuthSubmit['mode']): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.passwordVisible.set(false);
    this.confirmVisible.set(false);
    // Поля общие для обеих вкладок. Иначе ошибка с ухода из email остаётся на соседней вкладке.
    this.authForm().reset();
  }

  protected togglePassword(event: Event): void {
    event.preventDefault();
    this.passwordVisible.update((visible) => !visible);
  }

  protected toggleConfirm(event: Event): void {
    event.preventDefault();
    this.confirmVisible.update((visible) => !visible);
  }

  protected emailErrors(): Record<string, string> {
    const text = this.i18n.messages().validation;
    return { required: text.emailRequired, email: text.emailInvalid };
  }

  protected passwordErrors(): Record<string, string> {
    const text = this.i18n.messages().validation;
    return { required: text.passwordRequired, minLength: text.passwordShort, maxLength: text.passwordLong };
  }

  protected confirmErrors(): Record<string, string> {
    const text = this.i18n.messages().validation;
    return { required: text.confirmRequired, mismatch: text.passwordMismatch };
  }

  protected nameErrors(): Record<string, string> {
    return { maxLength: this.i18n.messages().validation.nameLong };
  }

  protected fieldError(
    field: { touched: () => boolean; errors: () => readonly { kind: string }[] },
    messages: Record<string, string>,
    order: readonly string[] = [],
  ): string | null {
    if (!field.touched()) return null;
    const errors = field.errors();
    const error = order.map((kind) => errors.find((item) => item.kind === kind)).find((item) => item) ?? errors[0];
    return error ? (messages[error.kind] ?? null) : null;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.authForm().markAsTouched();
    if (this.busy() || !this.authForm().valid()) return;
    const value = this.model();
    const name = value.name.trim();
    this.submitted.emit({
      mode: this.mode(),
      email: value.email.trim(),
      password: value.password,
      name: this.mode() === 'register' && name ? name : undefined,
    });
  }
}
