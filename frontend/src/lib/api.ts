import type { ApiError, GenerateTripRequest, Trip, TripSummary, UpdateTripRequest } from "@travel/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiRequestError(`Бэкенд недоступен (${API_URL}). Запустите: npm run dev:backend`, 0);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(body?.error ?? `Ошибка запроса: ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function generateTrip(payload: GenerateTripRequest): Promise<Trip> {
  return request<Trip>("/api/trips/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getTrip(id: string): Promise<Trip> {
  return request<Trip>(`/api/trips/${encodeURIComponent(id)}`);
}

export function listSavedTrips(): Promise<TripSummary[]> {
  return request<TripSummary[]>("/api/trips?saved=true");
}

export function updateTrip(id: string, payload: UpdateTripRequest): Promise<Trip> {
  return request<Trip>(`/api/trips/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteTrip(id: string): Promise<void> {
  return request<void>(`/api/trips/${encodeURIComponent(id)}`, { method: "DELETE" });
}
