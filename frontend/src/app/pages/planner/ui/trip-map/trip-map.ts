import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, output, untracked } from '@angular/core';
import type { DayPlan, Route, TransitStop, TransportMode } from '@travel/shared';
import * as L from 'leaflet';
import type { LatLngExpression, LatLngTuple } from 'leaflet';
import { I18n } from '../../../../core/i18n/i18n';
import { fill } from '../../lib/format';
import { LOCATION_TYPE_META, dayColor } from '../../lib/labels';

const DEFAULT_CENTER: LatLngTuple = [48.8566, 2.3522];
const MAX_ZOOM = 16;

function numberedIcon(n: number, color: string, active: boolean): L.DivIcon {
  const size = active ? 38 : 30;
  return L.divIcon({
    className: 'trip-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};color:#fff;
      display:flex;align-items:center;justify-content:center;font:700 ${active ? 15 : 13}px/1 sans-serif;
      border:3px solid #fff;box-shadow:0 4px 12px rgba(15,23,42,.35)">${n}</div>`,
  });
}

function stationIcon(color: string): L.DivIcon {
  const size = 16;
  return L.divIcon({
    className: 'trip-station',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:999px;background:#fff;border:3px solid ${color};box-shadow:0 2px 6px rgba(15,23,42,.35)"></div>`,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[char] ?? char;
  });
}

@Component({
  selector: 'app-trip-map',
  template: '',
  styleUrl: './trip-map.scss',
  host: { class: 'trip-map' },
})
export class TripMap {
  readonly day = input<DayPlan | undefined>();
  readonly selectedItemId = input<string | null>(null);
  readonly itemSelect = output<string>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(I18n);
  private map?: L.Map;
  private readonly markersLayer = L.layerGroup();
  private lines: L.Polyline[] = [];
  private fittedKey: string | null = null;
  private points: LatLngTuple[] = [];
  private lastHeight = 0;
  private readonly markers = new Map<string, L.Marker>();

  constructor() {
    afterNextRender(() => this.mount());
    effect(() => {
      this.day();
      this.selectedItemId();
      this.i18n.locale();
      untracked(() => this.render());
    });
  }

  private mount(): void {
    const map = L.map(this.host.nativeElement, { zoomControl: true }).setView(DEFAULT_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    this.markersLayer.addTo(map);
    this.map = map;
    const observer = new ResizeObserver(() => this.onResize());
    observer.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
    this.render();
  }

  private clearLines(): void {
    for (const line of this.lines) line.remove();
    this.lines = [];
  }

  /**
   * Улица — сплошная линия. Поездка между станциями — короткий пунктир.
   * Нет сегментов и геометрии — прямая и подпись режима.
   */
  private drawRoutes(map: L.Map, day: DayPlan | undefined, color: string): void {
    const routes = day?.routes ?? [];
    if (routes.length === 0) {
      const stops: LatLngTuple[] = (day?.items ?? []).map((item) => [item.location.coordinates.lat, item.location.coordinates.lng]);
      if (stops.length > 1) this.addLine(map, stops, color, '8 8');
      return;
    }

    for (const route of routes) {
      if (route.segments?.length) {
        for (const segment of route.segments) {
          const geometry = segment.geometry;
          if (!geometry || geometry.length < 2) continue;
          const latlngs = geometry.map((point) => [point.lat, point.lng] as LatLngTuple);
          const transit = segment.kind === 'transit';
          const hint = transit ? this.transitHint(route, segment.label) : undefined;
          this.addLine(map, latlngs, color, transit ? '1 8' : undefined, hint);
        }
        continue;
      }

      const geometry = route.geometry;
      if (geometry && geometry.length > 1) {
        this.addLine(map, geometry.map((point) => [point.lat, point.lng]), color);
        continue;
      }

      const straight: LatLngTuple[] = [
        [route.from.lat, route.from.lng],
        [route.to.lat, route.to.lng],
      ];
      const hint =
        route.ride?.status === 'unavailable'
          ? `${this.transportLabel(route.transport)} · ${this.i18n.messages().leg.stationsMissing}`
          : undefined;
      this.addLine(map, straight, color, '8 8', hint);
    }
  }

  private addLine(map: L.Map, latlngs: LatLngTuple[], color: string, dashArray?: string, tooltip?: string): void {
    const line = L.polyline(latlngs, {
      color,
      weight: dashArray === '1 8' ? 5 : 4,
      opacity: dashArray ? 0.85 : 0.9,
      ...(dashArray ? { dashArray } : {}),
    }).addTo(map);
    if (tooltip) line.bindTooltip(escapeHtml(tooltip), { sticky: true, opacity: 0.95 });
    this.lines.push(line);
  }

  private transitHint(route: Route, line?: string): string {
    const label = this.transportLabel(route.transport);
    return line ? `${label} · ${fill(this.i18n.messages().leg.line, { name: line })}` : label;
  }

  private transportLabel(mode: TransportMode): string {
    return this.i18n.messages().transport[mode];
  }

  private drawStations(day: DayPlan | undefined, color: string): void {
    const seen = new Set<string>();
    for (const route of day?.routes ?? []) {
      const ride = route.ride;
      if (!ride || ride.status === 'unavailable') continue;
      const marks: { stop: TransitStop; caption: string }[] = [];
      const captions = this.i18n.messages().map;
      if (ride.board) marks.push({ stop: ride.board, caption: ride.status === 'same-stop' ? captions.station : captions.board });
      for (const stop of ride.transfers ?? []) marks.push({ stop, caption: captions.transfer });
      if (ride.status === 'ride' && ride.alight) marks.push({ stop: ride.alight, caption: captions.alight });

      for (const mark of marks) {
        const key = `${mark.stop.coordinates.lat.toFixed(5)},${mark.stop.coordinates.lng.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const marker = L.marker([mark.stop.coordinates.lat, mark.stop.coordinates.lng], {
          icon: stationIcon(color),
          zIndexOffset: 400,
        });
        marker.bindTooltip(escapeHtml(`${mark.caption}: ${mark.stop.name}`), { direction: 'top', opacity: 0.95 });
        marker.addTo(this.markersLayer);
      }
    }
  }

  /** Пока контейнер нулевой, кадр не запоминаем: вкладка карты могла быть скрыта. */
  private onResize(): void {
    const map = this.map;
    if (!map) return;
    const height = map.getContainer().clientHeight;
    const gainedSize = this.lastHeight === 0 && height > 0;
    map.invalidateSize();
    this.lastHeight = height;
    if (gainedSize && this.fittedKey === null) this.fit(map, this.points);
  }

  private render(): void {
    const map = this.map;
    if (!map) return;
    const day = this.day();
    const selectedId = this.selectedItemId();
    const color = day ? dayColor(day.dayNumber) : '#2563eb';
    const points: LatLngTuple[] = (day?.items ?? []).map((item) => [item.location.coordinates.lat, item.location.coordinates.lng]);
    this.points = this.framePoints(points, day);

    this.markersLayer.clearLayers();
    this.markers.clear();
    this.clearLines();
    this.drawRoutes(map, day, color);

    day?.items.forEach((item, index) => {
      const visual = LOCATION_TYPE_META[item.location.type] ?? LOCATION_TYPE_META.other;
      const typeLabel = this.i18n.messages().locationType[item.location.type] ?? this.i18n.messages().locationType.other;
      const active = item.id === selectedId;
      const marker = L.marker([item.location.coordinates.lat, item.location.coordinates.lng], {
        icon: numberedIcon(index + 1, color, active),
        zIndexOffset: active ? 1000 : 0,
      });
      marker.on('click', () => this.itemSelect.emit(item.id));
      const time = `${item.startTime}${item.endTime ? ` – ${item.endTime}` : ''}`;
      const source = item.location.geocoded ? this.i18n.messages().map.osm : this.i18n.messages().map.ai;
      const sourceColor = item.location.geocoded ? '#047857' : '#b45309';
      marker.bindPopup(
        `<div style="width:min(16rem, calc(100vw - 2rem))">
          <p style="margin:0;font-size:12px;font-weight:600;color:#64748b">${escapeHtml(time)} · ${visual.emoji} ${escapeHtml(typeLabel)}</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:650;color:#0f172a">${index + 1}. ${escapeHtml(item.location.name)}</p>
          <p style="margin:4px 0 0;font-size:12px;line-height:1.45;color:#475569">${escapeHtml(item.location.description)}</p>
          <p style="margin:6px 0 0;font-size:10px;font-weight:600;color:${sourceColor}">${source}</p>
        </div>`,
        { minWidth: 0, maxWidth: Math.min(256, Math.max(160, window.innerWidth - 32)) },
      );
      marker.addTo(this.markersLayer);
      this.markers.set(item.id, marker);
    });

    this.drawStations(day, color);
    this.fit(map, this.points);
    const selected = selectedId ? this.markers.get(selectedId) : undefined;
    if (selected) {
      map.panTo(selected.getLatLng(), { animate: true });
      selected.openPopup();
    }
  }

  /** Остановки дня плюс станции, чтобы вход и выход не остались за краем кадра. */
  private framePoints(stops: LatLngTuple[], day: DayPlan | undefined): LatLngTuple[] {
    const frame = [...stops];
    for (const route of day?.routes ?? []) {
      const ride = route.ride;
      if (!ride || ride.status === 'unavailable') continue;
      for (const stop of [ride.board, ride.alight, ...(ride.transfers ?? [])]) {
        if (stop) frame.push([stop.coordinates.lat, stop.coordinates.lng]);
      }
    }
    return frame;
  }

  /**
   * Центрирует карту на первой точке дня и подбирает зум так,
   * чтобы при таком центре все остальные точки дня тоже попадали в кадр.
   * Новый объект поездки без смены координат вид не сбрасывает.
   */
  private fit(map: L.Map, points: LatLngTuple[]): void {
    if (map.getContainer().clientHeight === 0) return;
    const first = points[0];
    const key = points.length ? points.map((point) => point.join(',')).join(';') : null;
    if (key === this.fittedKey) return;
    this.fittedKey = key;
    if (!first) return;

    map.invalidateSize();
    const mirrored = points.map(([lat, lng]) => [2 * first[0] - lat, 2 * first[1] - lng] as LatLngTuple);
    const bounds = L.latLngBounds([...points, ...mirrored] as LatLngExpression[]);
    const zoom = points.length > 1 ? Math.min(map.getBoundsZoom(bounds, false, L.point(40, 40)), MAX_ZOOM) : 14;
    const isNearby = map.getBounds().contains(first) && Math.abs(map.getZoom() - zoom) <= 3;
    if (isNearby) map.flyTo(first, zoom, { duration: 0.8 });
    else map.setView(first, zoom, { animate: false });
  }
}
