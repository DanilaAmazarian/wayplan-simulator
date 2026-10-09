import OpenAI from 'openai';
import {
  LOCATION_TYPES,
  TRANSPORT_MODES,
  type GenerateTripRequest,
  type LocationType,
  type TransportMode,
} from '@travel/shared';
import { HttpError } from '../errors.js';
import { generateWithCursor } from './cursorProvider.js';
import { mockItinerary } from './mockItinerary.js';

export interface GeneratedItem {
  startTime: string;
  endTime: string | null;
  transport: TransportMode;
  notes: string | null;
  location: {
    name: string;
    description: string;
    type: LocationType;
    address: string | null;
    lat: number;
    lng: number;
    geocoded?: boolean;
  };
}

export interface GeneratedDay {
  dayNumber: number;
  title: string;
  items: GeneratedItem[];
}

export interface GeneratedItinerary {
  title: string;
  days: GeneratedDay[];
}

/** JSON Schema для Structured Outputs: в strict-режиме все поля обязательны, опциональные — nullable. */
const ITINERARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'days'],
  properties: {
    title: { type: 'string' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['dayNumber', 'title', 'items'],
        properties: {
          dayNumber: { type: 'integer' },
          title: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['startTime', 'endTime', 'transport', 'notes', 'location'],
              properties: {
                startTime: { type: 'string', description: 'Время начала, формат HH:mm' },
                endTime: { type: ['string', 'null'], description: 'Время окончания, формат HH:mm' },
                transport: {
                  type: 'string',
                  enum: [...TRANSPORT_MODES],
                  description: 'Как добраться до этой точки от предыдущей',
                },
                notes: { type: ['string', 'null'] },
                location: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['name', 'description', 'type', 'address', 'lat', 'lng'],
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    type: { type: 'string', enum: [...LOCATION_TYPES] },
                    address: { type: ['string', 'null'] },
                    lat: { type: 'number', description: 'Широта WGS84' },
                    lng: { type: 'number', description: 'Долгота WGS84' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `Ты — опытный тревел-планировщик. Составляй реалистичные маршруты по реально существующим местам.
Правила:
- Используй только реальные места с точными координатами WGS84 (lat/lng), проверенными по твоим знаниям.
- В каждом дне 4–7 точек: достопримечательности, еда (обед и ужин), отдых.
- Точки одного дня должны быть географически близки друг к другу, чтобы минимизировать переезды.
- Время в формате HH:mm, в хронологическом порядке, день начинается около 09:00 и заканчивается до 22:00.
- transport — способ добраться до точки от предыдущей; для первой точки дня укажи "walk".
- Описания пиши на русском языке, 1–2 предложения.`;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

let client: OpenAI | null = null;

type Provider = { name: 'openai'; apiKey: string } | { name: 'cursor'; apiKey: string };

/**
 * LLM_PROVIDER задаёт провайдера явно. Без него: CURSOR_API_KEY → Cursor,
 * ключ формата Cursor (crsr_…) в OPENAI_API_KEY → Cursor, иначе OpenAI.
 */
function resolveProvider(): Provider {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  const cursorKey = process.env.CURSOR_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (explicit === 'cursor' || (!explicit && (cursorKey || openaiKey?.startsWith('crsr_')))) {
    const apiKey = cursorKey || openaiKey;
    if (!apiKey) throw new HttpError(503, 'CURSOR_API_KEY не задан в backend/.env');
    return { name: 'cursor', apiKey };
  }
  if (!openaiKey) throw new HttpError(503, 'OPENAI_API_KEY не задан в backend/.env');
  return { name: 'openai', apiKey: openaiKey };
}

function getClient(apiKey: string): OpenAI {
  client ??= new OpenAI({ apiKey });
  return client;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function validateItinerary(data: unknown, durationDays: number): GeneratedItinerary {
  const rawDays = isObject(data) && Array.isArray(data.days) ? data.days : [];
  if (rawDays.length === 0) {
    throw new HttpError(502, 'Модель вернула пустой план');
  }

  const days = rawDays.slice(0, durationDays).map((day: unknown, dayIdx): GeneratedDay => {
    const rawItems = isObject(day) && Array.isArray(day.items) ? day.items : [];
    const items: GeneratedItem[] = [];

    for (const it of rawItems) {
      if (!isObject(it) || !isObject(it.location)) continue;
      const loc = it.location;
      const lat = Number(loc.lat);
      const lng = Number(loc.lng);
      const startTime = String(it.startTime ?? '');
      const name = typeof loc.name === 'string' ? loc.name.trim() : '';
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        continue;
      }
      if (!TIME_RE.test(startTime)) continue;

      const endTime = typeof it.endTime === 'string' && TIME_RE.test(it.endTime) ? it.endTime : null;
      const transport = TRANSPORT_MODES.includes(it.transport as TransportMode)
        ? (it.transport as TransportMode)
        : 'walk';
      const type = LOCATION_TYPES.includes(loc.type as LocationType) ? (loc.type as LocationType) : 'other';

      items.push({
        startTime,
        endTime,
        transport,
        notes: typeof it.notes === 'string' ? it.notes : null,
        location: {
          name,
          description: typeof loc.description === 'string' ? loc.description : '',
          type,
          address: typeof loc.address === 'string' && loc.address.trim() ? loc.address : null,
          lat,
          lng,
        },
      });
    }

    if (items.length === 0) {
      throw new HttpError(502, `День ${dayIdx + 1}: нет локаций с корректными данными`);
    }
    const title = isObject(day) && typeof day.title === 'string' ? day.title : `День ${dayIdx + 1}`;
    return { dayNumber: dayIdx + 1, title, items };
  });

  const title = isObject(data) && typeof data.title === 'string' ? data.title : '';
  return { title, days };
}

function buildUserPrompt(req: GenerateTripRequest): string {
  return [
    `Город: ${req.destination}`,
    `Количество дней: ${req.durationDays}`,
    `Интересы: ${req.preferences?.trim() || 'классический туристический маршрут'}`,
    `Верни ровно ${req.durationDays} дн. с dayNumber от 1 до ${req.durationDays}.`,
  ].join('\n');
}

export async function generateItinerary(req: GenerateTripRequest): Promise<GeneratedItinerary> {
  if (process.env.OPENAI_MOCK === '1') {
    return validateItinerary(mockItinerary(req), req.durationDays);
  }

  const provider = resolveProvider();
  const raw =
    provider.name === 'cursor'
      ? await generateWithCursor({
          apiKey: provider.apiKey,
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: buildUserPrompt(req),
          schema: ITINERARY_SCHEMA,
        })
      : await generateWithOpenAI(provider.apiKey, buildUserPrompt(req));

  return validateItinerary(raw, req.durationDays);
}

async function generateWithOpenAI(apiKey: string, userPrompt: string): Promise<unknown> {
  const openai = getClient(apiKey);
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.7,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'itinerary', strict: true, schema: ITINERARY_SCHEMA },
    },
  });

  const message = completion.choices[0]?.message;
  if (message?.refusal) {
    throw new HttpError(422, `Модель отказалась отвечать: ${message.refusal}`);
  }
  if (!message?.content) {
    throw new HttpError(502, 'Пустой ответ от OpenAI');
  }

  try {
    return JSON.parse(message.content) as unknown;
  } catch {
    throw new HttpError(502, 'OpenAI вернул некорректный JSON');
  }
}
