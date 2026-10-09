"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Bookmark, BookmarkCheck, Loader2, Plane, Plus } from "lucide-react";
import type { GenerateTripRequest, Trip, TripSummary, UpdateTripRequest } from "@travel/shared";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiRequestError, deleteTrip, generateTrip, getTrip, listSavedTrips, updateTrip } from "@/lib/api";
import { DAY_FORMS, POINT_FORMS, countLabel } from "@/lib/format";
import { DayTimeline } from "./DayTimeline";
import { EditableTitle } from "./EditableTitle";
import { SavedTrips } from "./SavedTrips";
import { TripForm } from "./TripForm";
import { TripSkeleton } from "./TripSkeleton";

const TripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

function toSummary(trip: Trip): TripSummary {
  return {
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    saved: trip.saved,
    daysCount: trip.days.length,
    itemsCount: trip.days.reduce((n, d) => n + d.items.length, 0),
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}

/** `title` описывает действие, которое не удалось; отдельные заголовки — только для лимита ИИ, сети и валидации. */
function showError(err: unknown, title: string) {
  const description = err instanceof Error ? err.message : undefined;
  if (!(err instanceof ApiRequestError)) {
    toast.error(title, { description });
    return;
  }
  if (err.status === 429) {
    toast.error("Лимит ИИ-провайдера исчерпан", { description, duration: 10_000 });
  } else if (err.status === 0) {
    toast.error("Нет связи с сервером", { description });
  } else if (err.status === 400) {
    toast.warning("Проверьте данные", { description });
  } else {
    toast.error(title, { description });
  }
}

export function TripDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tripIdFromUrl = searchParams.get("trip");

  const [trip, setTrip] = useState<Trip | null>(null);
  const [activeDay, setActiveDay] = useState(1);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Поездка из URL, которую не нужно загружать: загрузка упала или пользователь нажал «Новая». */
  const [skippedTripId, setSkippedTripId] = useState<string | null>(null);
  const loadingFromUrl = !!tripIdFromUrl && trip?.id !== tripIdFromUrl && skippedTripId !== tripIdFromUrl;
  const [savedTrips, setSavedTrips] = useState<TripSummary[] | null>(null);
  const [savingTrip, setSavingTrip] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSavedTrips()
      .then((list) => !cancelled && setSavedTrips(list))
      .catch((e: unknown) => {
        if (cancelled) return;
        setSavedTrips([]);
        showError(e, "Не удалось загрузить сохранённые маршруты");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Синхронизирует список «Мои маршруты» с актуальным состоянием поездки. */
  const syncSavedList = (updated: Trip) => {
    setSavedTrips((list) => {
      const rest = (list ?? []).filter((t) => t.id !== updated.id);
      return updated.saved ? [toSummary(updated), ...rest] : rest;
    });
  };

  const patchTrip = async (payload: UpdateTripRequest) => {
    if (!trip) return null;
    const updated = await updateTrip(trip.id, payload);
    setTrip(updated);
    syncSavedList(updated);
    return updated;
  };

  useEffect(() => {
    if (!tripIdFromUrl || trip?.id === tripIdFromUrl || skippedTripId === tripIdFromUrl) return;
    let cancelled = false;
    getTrip(tripIdFromUrl)
      .then((t) => {
        if (cancelled) return;
        setTrip(t);
        setActiveDay(t.days[0]?.dayNumber ?? 1);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setSkippedTripId(tripIdFromUrl);
        showError(e, "Не удалось открыть маршрут");
      });
    return () => {
      cancelled = true;
    };
  }, [tripIdFromUrl, trip?.id, skippedTripId]);

  const handleGenerate = async (payload: GenerateTripRequest) => {
    setLoading(true);
    try {
      const created = await generateTrip(payload);
      setTrip(created);
      setActiveDay(created.days[0]?.dayNumber ?? 1);
      setSelectedItemId(null);
      router.replace(`${pathname}?trip=${created.id}`, { scroll: false });

      const items = created.days.flatMap((d) => d.items);
      const geocoded = items.filter((i) => i.location.geocoded).length;
      toast.success("Маршрут готов", {
        description: `${countLabel(created.days.length, DAY_FORMS)}, ${countLabel(items.length, POINT_FORMS)} · координаты OSM: ${geocoded}/${items.length}`,
      });
    } catch (e) {
      showError(e, "Не удалось сгенерировать поездку");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSkippedTripId(tripIdFromUrl);
    setTrip(null);
    setSelectedItemId(null);
    router.replace(pathname, { scroll: false });
  };

  const handleToggleSaved = async () => {
    if (!trip) return;
    setSavingTrip(true);
    try {
      const updated = await patchTrip({ saved: !trip.saved });
      if (updated?.saved) toast.success("Маршрут сохранён", { description: "Он появится в «Моих маршрутах»" });
      else toast("Маршрут убран из сохранённых");
    } catch (e) {
      showError(e, "Не удалось сохранить маршрут");
    } finally {
      setSavingTrip(false);
    }
  };

  const handleRename = async (title: string) => {
    try {
      await patchTrip({ title });
    } catch (e) {
      showError(e, "Не удалось переименовать маршрут");
    }
  };

  const handleOpenSaved = (id: string) => {
    setSkippedTripId(null);
    setSelectedItemId(null);
    router.replace(`${pathname}?trip=${id}`, { scroll: false });
  };

  const handleDeleteSaved = async (id: string) => {
    const previous = savedTrips;
    setSavedTrips((list) => list?.filter((t) => t.id !== id) ?? list);
    try {
      await deleteTrip(id);
      toast.success("Маршрут удалён");
    } catch (e) {
      setSavedTrips(previous);
      showError(e, "Не удалось удалить маршрут");
    }
  };

  const handleDayChange = (dayNumber: number) => {
    setActiveDay(dayNumber);
    setSelectedItemId(null);
  };

  const currentDay = trip?.days.find((d) => d.dayNumber === activeDay) ?? trip?.days[0];

  let panel;
  if (trip) {
    panel = (
      <DayTimeline
        trip={trip}
        activeDay={currentDay?.dayNumber ?? 1}
        selectedItemId={selectedItemId}
        onDayChange={handleDayChange}
        onSelectItem={setSelectedItemId}
      />
    );
  } else if (loadingFromUrl) {
    panel = <TripSkeleton />;
  } else {
    panel = (
      <div className="flex flex-col gap-6">
        <TripForm loading={loading} onSubmit={handleGenerate} />
        {loading ? (
          <TripSkeleton />
        ) : (
          <SavedTrips trips={savedTrips} onOpen={handleOpenSaved} onDelete={handleDeleteSaved} />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-muted/40 md:flex-row">
      <aside className="flex h-[55vh] w-full flex-col border-b bg-background md:h-full md:w-[440px] md:shrink-0 md:border-r md:border-b-0 lg:w-[480px]">
        <header className="flex items-center justify-between gap-3 border-b px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Plane className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-widest text-primary uppercase">AI Travel Planner</p>
              {trip ? (
                <EditableTitle key={trip.id} value={trip.title} onSave={handleRename} />
              ) : (
                <h1 className="truncate text-base font-semibold">Новая поездка</h1>
              )}
            </div>
          </div>
          {trip && (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant={trip.saved ? "secondary" : "default"}
                size="sm"
                onClick={handleToggleSaved}
                disabled={savingTrip}
                aria-pressed={trip.saved}
                title={trip.saved ? "Убрать из «Моих маршрутов»" : "Сохранить в «Мои маршруты»"}
              >
                {savingTrip ? <Loader2 className="animate-spin" /> : trip.saved ? <BookmarkCheck /> : <Bookmark />}
                {trip.saved ? "Сохранено" : "Сохранить"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <Plus />
                Новая
              </Button>
            </div>
          )}
        </header>

        <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
          <div className="px-6 py-5">{panel}</div>
        </ScrollArea>
      </aside>

      <main className="relative min-h-0 flex-1">
        <TripMap day={currentDay} selectedItemId={selectedItemId} onSelectItem={setSelectedItemId} />
      </main>
    </div>
  );
}
