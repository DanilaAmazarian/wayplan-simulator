import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TuiNotificationService } from '@taiga-ui/core';
import { safeReturnUrl } from '../../core/auth/auth.guard';
import { Session } from '../../core/auth/session';
import { ApiRequestError } from '../../core/http/api-error';
import { I18n } from '../../core/i18n/i18n';
import { LocaleSwitch } from '../../core/i18n/locale-switch';
import { AuthForm, type AuthSubmit } from './ui/auth-form/auth-form';

@Component({
  selector: 'app-auth',
  imports: [LocaleSwitch, AuthForm],
  templateUrl: './auth.page.html',
  styleUrl: './auth.page.scss',
})
export class AuthPage {
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(TuiNotificationService);
  private readonly i18n = inject(I18n);
  protected readonly busy = signal(false);

  protected async onSubmit(payload: AuthSubmit): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      if (payload.mode === 'register') {
        await this.session.register({ email: payload.email, password: payload.password, name: payload.name });
      } else {
        await this.session.login({ email: payload.email, password: payload.password });
      }
      await this.router.navigateByUrl(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')), { replaceUrl: true });
    } catch (error) {
      const text = this.i18n.messages().toast;
      this.showError(error, payload.mode === 'register' ? text.accountFailed : text.loginFailed);
    } finally {
      this.busy.set(false);
    }
  }

  private showError(error: unknown, title: string): void {
    const description = error instanceof Error ? error.message : undefined;
    const text = this.i18n.messages().toast;
    if (!(error instanceof ApiRequestError)) {
      this.notify(title, 'negative', description);
      return;
    }
    if (error.status === 429) this.notify(text.rateLimit, 'negative', description, 10_000);
    else if (error.status === 0) this.notify(text.offline, 'negative', description);
    else if (error.status === 400) this.notify(text.checkData, 'warning', description);
    else this.notify(title, 'negative', description);
  }

  private notify(title: string, appearance: 'positive' | 'negative' | 'warning' | 'info', description?: string, autoClose = 3000): void {
    this.notifications.open(description ?? title, { label: description ? title : '', appearance, autoClose }).subscribe();
  }
}
