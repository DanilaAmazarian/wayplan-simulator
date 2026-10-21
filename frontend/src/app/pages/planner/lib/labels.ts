import type { LocationType, TransportMode } from '@travel/shared';

export const LOCATION_TYPE_META: Record<LocationType, { emoji: string; color: string }> = {
  attraction: { emoji: '🏛️', color: '#6366f1' },
  museum: { emoji: '🖼️', color: '#8b5cf6' },
  restaurant: { emoji: '🍽️', color: '#f97316' },
  cafe: { emoji: '☕', color: '#b45309' },
  hotel: { emoji: '🏨', color: '#0ea5e9' },
  park: { emoji: '🌳', color: '#16a34a' },
  shopping: { emoji: '🛍️', color: '#db2777' },
  nightlife: { emoji: '🍸', color: '#7c3aed' },
  transport_hub: { emoji: '🚉', color: '#475569' },
  other: { emoji: '📍', color: '#64748b' },
};

export const TRANSPORT_META: Record<TransportMode, { emoji: string }> = {
  walk: { emoji: '🚶' },
  bike: { emoji: '🚲' },
  car: { emoji: '🚗' },
  taxi: { emoji: '🚕' },
  bus: { emoji: '🚌' },
  metro: { emoji: '🚇' },
  train: { emoji: '🚆' },
  ferry: { emoji: '⛴️' },
  plane: { emoji: '✈️' },
};

export const DAY_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2'];

export const dayColor = (dayNumber: number) => DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length] ?? DAY_COLORS[0];
