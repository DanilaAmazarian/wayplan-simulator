"use client";

import { useState } from "react";
import { Bookmark, CalendarDays, ChevronRight, MapPin, Trash2 } from "lucide-react";
import type { TripSummary } from "@travel/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DAY_FORMS, POINT_FORMS, countLabel } from "@/lib/format";

interface SavedTripsProps {
  /** `null` — список ещё загружается. */
  trips: TripSummary[] | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

const formatSavedAt = (iso: string) => dateFormat.format(new Date(iso));

export function SavedTrips({ trips, onOpen, onDelete }: SavedTripsProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Bookmark className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Мои маршруты</h2>
        {trips && trips.length > 0 && <span className="text-xs text-muted-foreground">{trips.length}</span>}
      </div>

      {trips === null && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {trips?.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
          Пока пусто. Сгенерируйте поездку и нажмите «Сохранить», чтобы она появилась здесь.
        </p>
      )}

      {trips && trips.length > 0 && (
        <ul className="flex flex-col gap-2">
          {trips.map((t) => {
            const confirming = confirmId === t.id;
            return (
              <li
                key={t.id}
                className="group flex items-center gap-2 rounded-lg border bg-card p-1 pr-2 transition-colors hover:border-primary/40 hover:bg-accent/40"
                onMouseLeave={() => confirming && setConfirmId(null)}
              >
                <button
                  type="button"
                  onClick={() => onOpen(t.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <MapPin className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" title={t.title}>
                      {t.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="size-3 shrink-0" />
                      <span className="truncate">
                        {t.destination} · {countLabel(t.daysCount, DAY_FORMS)} · {countLabel(t.itemsCount, POINT_FORMS)} ·{" "}
                        {formatSavedAt(t.updatedAt)}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </button>

                {confirming ? (
                  <Button
                    variant="destructive"
                    size="xs"
                    onClick={() => {
                      setConfirmId(null);
                      onDelete(t.id);
                    }}
                  >
                    Удалить?
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Удалить «${t.title}»`}
                    title="Удалить маршрут"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmId(t.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
