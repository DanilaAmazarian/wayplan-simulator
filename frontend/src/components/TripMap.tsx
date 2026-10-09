"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L, { type LatLngTuple } from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { DayPlan } from "@travel/shared";
import { LOCATION_TYPE_META, dayColor } from "@/lib/labels";

interface TripMapProps {
  day: DayPlan | undefined;
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
}

const DEFAULT_CENTER: LatLngTuple = [48.8566, 2.3522];
const MAX_ZOOM = 16;

function numberedIcon(n: number, color: string, active: boolean) {
  const size = active ? 38 : 30;
  return L.divIcon({
    className: "trip-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};color:#fff;
      display:flex;align-items:center;justify-content:center;font:700 ${active ? 15 : 13}px/1 sans-serif;
      border:3px solid #fff;box-shadow:0 4px 12px rgba(15,23,42,.35)">${n}</div>`,
  });
}

/**
 * Центрирует карту на первой точке дня и подбирает зум так,
 * чтобы при таком центре все остальные точки дня тоже попадали в кадр.
 */
function FitDay({ points }: { points: LatLngTuple[] }) {
  const map = useMap();
  /** Новый объект поездки (после переименования или сохранения) не должен сбрасывать вид карты. */
  const fittedKey = useRef<string | null>(null);

  useEffect(() => {
    const first = points[0];
    const key = points.length ? points.join(";") : null;
    if (key === fittedKey.current) return;
    fittedKey.current = key;
    if (!first) return;

    map.invalidateSize();
    const mirrored = points.map(([lat, lng]) => [2 * first[0] - lat, 2 * first[1] - lng] as LatLngTuple);
    const bounds = L.latLngBounds([...points, ...mirrored]);
    const zoom = points.length > 1 ? Math.min(map.getBoundsZoom(bounds, false, L.point(40, 40)), MAX_ZOOM) : 14;
    const isNearby = map.getBounds().contains(first) && Math.abs(map.getZoom() - zoom) <= 3;
    if (isNearby) {
      map.flyTo(first, zoom, { duration: 0.8 });
    } else {
      map.setView(first, zoom, { animate: false });
    }
  }, [map, points]);

  return null;
}

/** Leaflet кэширует размер контейнера — пересчитываем его при изменении раскладки панелей. */
function AutoResize() {
  const map = useMap();

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  return null;
}

function FocusSelected({ marker }: { marker: L.Marker | undefined }) {
  const map = useMap();

  useEffect(() => {
    if (!marker) return;
    map.panTo(marker.getLatLng(), { animate: true });
    marker.openPopup();
  }, [map, marker]);

  return null;
}

export default function TripMap({ day, selectedItemId, onSelectItem }: TripMapProps) {
  const markerRefs = useRef(new Map<string, L.Marker>());
  const [selectedMarker, setSelectedMarker] = useState<L.Marker | undefined>();
  const color = day ? dayColor(day.dayNumber) : "#2563eb";

  const points = useMemo<LatLngTuple[]>(
    () => (day?.items ?? []).map((it) => [it.location.coordinates.lat, it.location.coordinates.lng]),
    [day],
  );

  useEffect(() => {
    setSelectedMarker(selectedItemId ? markerRefs.current.get(selectedItemId) : undefined);
  }, [selectedItemId]);

  return (
    <MapContainer center={points[0] ?? DEFAULT_CENTER} zoom={13} className="h-full w-full" zoomControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <AutoResize />
      <FitDay points={points} />
      <FocusSelected marker={selectedMarker} />

      {points.length > 1 && (
        <Polyline positions={points} pathOptions={{ color, weight: 4, opacity: 0.8, dashArray: "8 8" }} />
      )}

      {day?.items.map((item, idx) => {
        const meta = LOCATION_TYPE_META[item.location.type] ?? LOCATION_TYPE_META.other;
        return (
          <Marker
            key={item.id}
            position={[item.location.coordinates.lat, item.location.coordinates.lng]}
            icon={numberedIcon(idx + 1, color, item.id === selectedItemId)}
            zIndexOffset={item.id === selectedItemId ? 1000 : 0}
            eventHandlers={{ click: () => onSelectItem(item.id) }}
            ref={(m) => {
              if (m) markerRefs.current.set(item.id, m);
              else markerRefs.current.delete(item.id);
            }}
          >
            <Popup>
              <div className="min-w-48 max-w-64">
                <p className="text-xs font-semibold text-slate-500">
                  {item.startTime}
                  {item.endTime ? ` – ${item.endTime}` : ""} · {meta.emoji} {meta.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {idx + 1}. {item.location.name}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.location.description}</p>
                <p className={`mt-1.5 text-[10px] font-medium ${item.location.geocoded ? "text-emerald-700" : "text-amber-700"}`}>
                  {item.location.geocoded ? "✓ Координаты OpenStreetMap" : "≈ Координаты предложены ИИ"}
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
