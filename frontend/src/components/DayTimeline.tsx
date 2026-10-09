"use client";

import type { CSSProperties } from "react";
import { Clock, MapPin, MapPinCheck, Route as RouteIcon } from "lucide-react";
import type { DayPlan, ItineraryItem, Trip } from "@travel/shared";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { POINT_FORMS, countLabel } from "@/lib/format";
import { LOCATION_TYPE_META, TRANSPORT_META, dayColor } from "@/lib/labels";
import { cn } from "@/lib/utils";

interface DayTimelineProps {
  trip: Trip;
  activeDay: number;
  selectedItemId: string | null;
  onDayChange: (dayNumber: number) => void;
  onSelectItem: (itemId: string) => void;
}

/** `day.date` — календарная дата "YYYY-MM-DD", `new Date` разбирает её как полночь UTC. */
const dayDateFormat = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const dayStyle = (dayNumber: number) => ({ "--day": dayColor(dayNumber) }) as CSSProperties;

function LocationCard({
  item,
  index,
  distanceKm,
  selected,
  onSelect,
}: {
  item: ItineraryItem;
  index: number;
  distanceKm?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = LOCATION_TYPE_META[item.location.type] ?? LOCATION_TYPE_META.other;
  const transport = TRANSPORT_META[item.transport];

  return (
    <li className="relative flex gap-3">
      <span className="z-10 mt-3 flex size-8 shrink-0 items-center justify-center rounded-full bg-(--day) text-sm font-bold text-white ring-4 ring-background">
        {index + 1}
      </span>

      <Card
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect())}
        size="sm"
        className={cn(
          "flex-1 cursor-pointer gap-2 px-4 transition-all duration-200 outline-none hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-(--day)/50",
          selected && "shadow-lg ring-2 shadow-(--day)/25 ring-(--day)",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1 font-mono text-xs font-medium text-muted-foreground">
              <Clock className="size-3" />
              {item.startTime}
              {item.endTime ? ` – ${item.endTime}` : ""}
            </p>
            <h4 className="mt-0.5 text-[15px] leading-snug font-semibold">{item.location.name}</h4>
          </div>
          <Badge
            variant="outline"
            className="shrink-0 border-transparent"
            style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
          >
            {meta.emoji} {meta.label}
          </Badge>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">{item.location.description}</p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {index > 0 && transport && (
            <span className="inline-flex items-center gap-1">
              {transport.emoji} {transport.label}
              {distanceKm !== undefined && ` · ${distanceKm.toFixed(1)} км`}
            </span>
          )}
          {item.location.address && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{item.location.address}</span>
            </span>
          )}
          {item.location.geocoded ? (
            <Badge variant="secondary" className="h-4.5 gap-0.5 px-1.5 text-[10px] text-emerald-700" title="Координаты подтверждены OpenStreetMap">
              <MapPinCheck /> OSM
            </Badge>
          ) : (
            <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px] text-amber-700" title="Координаты предложены ИИ и не подтверждены геокодером">
              ≈ ИИ
            </Badge>
          )}
        </div>
      </Card>
    </li>
  );
}

function DayPanel({
  day,
  selectedItemId,
  onSelectItem,
}: {
  day: DayPlan;
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
}) {
  const totalKm = (day.routes ?? []).reduce((sum, r) => sum + (r.distanceKm ?? 0), 0);
  const geocoded = day.items.filter((i) => i.location.geocoded).length;

  return (
    <div className="flex flex-col gap-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300" style={dayStyle(day.dayNumber)}>
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {dayDateFormat.format(new Date(day.date))}
        </p>
        <h3 className="text-lg font-semibold">{day.title || `День ${day.dayNumber}`}</h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <RouteIcon className="size-3.5" />
            {countLabel(day.items.length, POINT_FORMS)} · ≈ {totalKm.toFixed(1)} км
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPinCheck className="size-3.5" />
            OSM: {geocoded}/{day.items.length}
          </span>
        </p>
      </div>

      <ol className="relative flex flex-col gap-3">
        <span className="absolute top-6 bottom-6 left-[15px] w-0.5 rounded bg-(--day)/20" aria-hidden />
        {day.items.map((item, idx) => (
          <LocationCard
            key={item.id}
            item={item}
            index={idx}
            distanceKm={idx > 0 ? day.routes?.[idx - 1]?.distanceKm : undefined}
            selected={item.id === selectedItemId}
            onSelect={() => onSelectItem(item.id)}
          />
        ))}
      </ol>
    </div>
  );
}

export function DayTimeline({ trip, activeDay, selectedItemId, onDayChange, onSelectItem }: DayTimelineProps) {
  if (trip.days.length === 0) return <p className="text-sm text-muted-foreground">В поездке нет дней.</p>;

  return (
    <Tabs value={String(activeDay)} onValueChange={(v) => onDayChange(Number(v))} className="gap-4">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList className="h-9">
          {trip.days.map((day) => (
            <TabsTrigger
              key={day.dayNumber}
              value={String(day.dayNumber)}
              style={dayStyle(day.dayNumber)}
              className="group/trigger gap-1.5 px-3 data-[state=active]:bg-(--day) data-[state=active]:text-white data-[state=active]:shadow-md"
            >
              <span className="size-2 rounded-full bg-(--day) group-data-[state=active]/trigger:bg-white" />
              День {day.dayNumber}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {trip.days.map((day) => (
        <TabsContent key={day.dayNumber} value={String(day.dayNumber)}>
          <DayPanel day={day} selectedItemId={selectedItemId} onSelectItem={onSelectItem} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
