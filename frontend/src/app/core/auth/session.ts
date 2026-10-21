import { inject, Injectable, signal } from '@angular/core';
import { TuiNotificationService } from '@taiga-ui/core';
import type { AuthUser, LoginRequest, RegisterRequest } from '@travel/shared';
import { ApiRequestError } from '../http/api-error';
import { I18n } from '../i18n/i18n';
import { AuthApi } from './auth.api';

@Injectable({ providedIn: 'root' })
export class Session {
  private readonly auth = inject(AuthApi);
  private readonly i18n = inject(I18n);
  private readonly notifications = inject(TuiNotificationService);

  /** `undefined` — сессия ещё не проверялась. */
  readonly user = signal<AuthUser | null | undefined>(undefined);
  private pending: Promise<AuthUser | null> | null = null;

  ensure(): Promise<AuthUser | null> {
    const current = this.user();
    if (current !== undefined) return Promise.resolve(current);
    this.pending ??= this.restore().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  async login(body: LoginRequest): Promise<AuthUser> {
    const user = await this.auth.login(body);
    this.user.set(user);
    return user;
  }

  async register(body: RegisterRequest): Promise<AuthUser> {
    const user = await this.auth.register(body);
    this.user.set(user);
    return user;
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.user.set(null);
  }

  clear(): void {
    this.user.set(null);
  }

  private async restore(): Promise<AuthUser | null> {
    try {
      const user = await this.auth.me();
      this.user.set(user);
      return user;
    } catch (error) {
      this.user.set(null);
      if (!(error instanceof ApiRequestError && error.status === 401)) {
        const title = this.i18n.messages().toast.sessionFailed;
        const description = error instanceof Error ? error.message : undefined;
        this.notifications.open(description ?? title, { label: description ? title : '', appearance: 'negative', autoClose: 3000 }).subscribe();
      }
      return null;
    }
  }
}
