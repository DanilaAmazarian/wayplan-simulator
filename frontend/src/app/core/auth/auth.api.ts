import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { AuthUser, LoginRequest, RegisterRequest } from '@travel/shared';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../http/api-url';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  me(): Promise<AuthUser> {
    return firstValueFrom(this.http.get<AuthUser>(`${this.baseUrl}/api/auth/me`));
  }

  register(body: RegisterRequest): Promise<AuthUser> {
    return firstValueFrom(this.http.post<AuthUser>(`${this.baseUrl}/api/auth/register`, body));
  }

  login(body: LoginRequest): Promise<AuthUser> {
    return firstValueFrom(this.http.post<AuthUser>(`${this.baseUrl}/api/auth/login`, body));
  }

  logout(): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.baseUrl}/api/auth/logout`, {}));
  }
}
