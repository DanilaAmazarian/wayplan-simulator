import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { GenerateTripRequest, ShareLinkResponse, Trip, TripSummary, UpdateTripRequest } from '@travel/shared';
import { catchError, EMPTY, finalize, firstValueFrom, type Observable, Subject, switchMap, tap } from 'rxjs';
import { API_BASE_URL } from '../../../core/http/api-url';

/** Запрос отменён: новый `get` вытеснил предыдущий или пользователь остановил генерацию. */
export class AbortedRequestError extends Error {
  constructor() {
    super('Запрос отменён');
    this.name = 'AbortedRequestError';
  }
}

interface LoadRequest {
  id: string;
  resolve: (trip: Trip) => void;
  reject: (error: unknown) => void;
}

@Injectable()
export class TripApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly loads = new Subject<LoadRequest>();

  constructor() {
    this.loads
      .pipe(
        switchMap((request) => {
          let settled = false;
          const url = `${this.baseUrl}/api/trips/${encodeURIComponent(request.id)}`;
          return this.http.get<Trip>(url).pipe(
            tap((trip) => {
              settled = true;
              request.resolve(trip);
            }),
            catchError((error: unknown) => {
              settled = true;
              request.reject(error);
              return EMPTY;
            }),
            finalize(() => {
              if (!settled) request.reject(new AbortedRequestError());
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /** Отменяет незавершённый предыдущий `get`, если пользователь открыл другую поездку. */
  get(id: string): Promise<Trip> {
    return new Promise((resolve, reject) => {
      this.loads.next({ id, resolve, reject });
    });
  }

  listSaved(): Promise<TripSummary[]> {
    return this.body(this.http.get<TripSummary[]>(`${this.baseUrl}/api/trips`, { params: { saved: true } }));
  }

  /**
   * `HttpClient` не принимает `AbortSignal`: отписка обрывает XHR.
   * Обрыв не должен доходить до стора как «бэкенд недоступен» (статус 0).
   */
  generate(payload: GenerateTripRequest, signal: AbortSignal): Promise<Trip> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new AbortedRequestError());
        return;
      }

      let settled = false;
      let subscription: { unsubscribe(): void } | undefined;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        action();
      };
      const onAbort = () => {
        subscription?.unsubscribe();
        finish(() => reject(new AbortedRequestError()));
      };
      subscription = this.http.post<Trip>(`${this.baseUrl}/api/trips/generate`, payload).subscribe({
        next: (trip) => finish(() => resolve(trip)),
        error: (error: unknown) => finish(() => reject(signal.aborted ? new AbortedRequestError() : error)),
        complete: () => finish(() => reject(new AbortedRequestError())),
      });
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  update(id: string, payload: UpdateTripRequest): Promise<Trip> {
    return this.body(this.http.patch<Trip>(`${this.baseUrl}/api/trips/${encodeURIComponent(id)}`, payload));
  }

  delete(id: string): Promise<void> {
    return this.body(this.http.delete<void>(`${this.baseUrl}/api/trips/${encodeURIComponent(id)}`));
  }

  /** Идемпотентно: повторный вызов возвращает уже активный токен. */
  createShare(id: string): Promise<ShareLinkResponse> {
    return this.body(this.http.post<ShareLinkResponse>(`${this.baseUrl}/api/trips/${encodeURIComponent(id)}/share`, {}));
  }

  revokeShare(id: string): Promise<void> {
    return this.body(this.http.delete<void>(`${this.baseUrl}/api/trips/${encodeURIComponent(id)}/share`));
  }

  getShared(token: string): Promise<Trip> {
    return this.body(this.http.get<Trip>(`${this.baseUrl}/api/share/${encodeURIComponent(token)}`));
  }

  private body<T>(source: Observable<T>): Promise<T> {
    return firstValueFrom(source);
  }
}
