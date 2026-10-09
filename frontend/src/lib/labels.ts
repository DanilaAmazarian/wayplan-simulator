import type { LocationType, TransportMode } from "@travel/shared";

export const LOCATION_TYPE_META: Record<LocationType, { label: string; emoji: string; color: string }> = {
  attraction: { label: "Достопримечательность", emoji: "🏛️", color: "#6366f1" },
  museum: { label: "Музей", emoji: "🖼️", color: "#8b5cf6" },
  restaurant: { label: "Ресторан", emoji: "🍽️", color: "#f97316" },
  cafe: { label: "Кафе", emoji: "☕", color: "#b45309" },
  hotel: { label: "Отель", emoji: "🏨", color: "#0ea5e9" },
  park: { label: "Парк", emoji: "🌳", color: "#16a34a" },
  shopping: { label: "Шопинг", emoji: "🛍️", color: "#db2777" },
  nightlife: { label: "Ночная жизнь", emoji: "🍸", color: "#7c3aed" },
  transport_hub: { label: "Транспорт", emoji: "🚉", color: "#475569" },
  other: { label: "Другое", emoji: "📍", color: "#64748b" },
};

export const TRANSPORT_META: Record<TransportMode, { label: string; emoji: string }> = {
  walk: { label: "пешком", emoji: "🚶" },
  bike: { label: "на велосипеде", emoji: "🚲" },
  car: { label: "на машине", emoji: "🚗" },
  taxi: { label: "на такси", emoji: "🚕" },
  bus: { label: "на автобусе", emoji: "🚌" },
  metro: { label: "на метро", emoji: "🚇" },
  train: { label: "на поезде", emoji: "🚆" },
  ferry: { label: "на пароме", emoji: "⛴️" },
  plane: { label: "на самолёте", emoji: "✈️" },
};

export const DAY_COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2"];

export const dayColor = (dayNumber: number) => DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length];
