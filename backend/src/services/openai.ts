import OpenAI from 'openai';
import {
  LOCATION_TYPES,
  TRANSPORT_MODES,
  isLocale,
  type GenerateTripRequest,
  type Locale,
  type LocationType,
  type TransportMode,
} from '@travel/shared';
import { dayTitle, outputLanguage } from './phrases.js';
import { HttpError, throwIfAborted } from '../errors.js';
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
                  description:
                    'Как добраться от предыдущей точки. Первая точка дня — walk. До 1,5 км — walk. metro и train только на длинном переходе.',
                },
                notes: { type: ['string', 'null'] },
                location: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['name', 'description', 'type', 'address', 'lat', 'lng'],
                  properties: {
                    name: { type: 'string', description: 'Официальное имя существующего места, без общих формулировок' },
                    description: { type: 'string' },
                    type: { type: 'string', enum: [...LOCATION_TYPES] },
                    address: { type: ['string', 'null'], description: 'Улица и номер дома. null, только если адреса нет' },
                    lat: { type: 'number', description: 'Черновая широта WGS84. Название и адрес важнее' },
                    lng: { type: 'number', description: 'Черновая долгота WGS84. Название и адрес важнее' },
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

const SYSTEM_PROMPT = `Ты — опытный тревел-планировщик. Составляй маршруты только по реально существующим местам.
Правила:
- В name — официальное имя места. В address — улица и номер дома. Не пиши расплывчатые названия вроде «кафе в центре» и не подменяй место другим с похожим именем.
- lat и lng — черновые. Важнее точные name и address: по ним координаты уточнит геокодер.
- В каждом дне 4–7 точек: достопримечательности, еда (обед и ужин), отдых.
- Точки одного дня географически близки, чтобы не устраивать долгие переезды.
- Время в формате HH:mm, по возрастанию. День примерно с 09:00 до 22:00.
- transport — способ добраться до точки от предыдущей. Для первой точки дня всегда "walk".
- До ~1,5 км между соседними точками ставь "walk". "bike", "bus", "taxi" и "car" — когда пешком уже долго. "metro" и "train" — только если пеший переход явно большой и такой транспорт в этом городе есть. "plane" и "ferry" — только между разными городами или берегами, не внутри прогулки по центру.
- Если в запросе есть пожелания пользователя, они обязательны и важнее этих порогов.`;

function systemPrompt(locale: Locale): string {
  return `${SYSTEM_PROMPT}
- title, названия дней, name, description и notes пиши на ${outputLanguage(locale)} языке. Описания — 1–2 предложения.`;
}

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

function validateItinerary(data: unknown, durationDays: number, locale: Locale): GeneratedItinerary {
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
    const title = isObject(day) && typeof day.title === 'string' ? day.title : dayTitle(locale, dayIdx + 1);
    return { dayNumber: dayIdx + 1, title, items };
  });

  const title = isObject(data) && typeof data.title === 'string' ? data.title : '';
  return { title, days };
}

function buildUserPrompt(req: GenerateTripRequest, locale: Locale): string {
  const preferences = req.preferences?.trim();
  const lines = [
    `Город: ${req.destination}`,
    `Количество дней: ${req.durationDays}`,
    `Верни ровно ${req.durationDays} дн. с dayNumber от 1 до ${req.durationDays}.`,
    `Язык пользовательских текстов (title, названия дней, name, description, notes): ${outputLanguage(locale)}.`,
  ];
  if (preferences) {
    lines.push(`Пожелания пользователя обязательны и важнее типового выбора transport: ${preferences}`);
  } else {
    lines.push('Интересы: классический туристический маршрут.');
  }
  return lines.join('\n');
}

export async function generateItinerary(req: GenerateTripRequest, signal?: AbortSignal): Promise<GeneratedItinerary> {
  throwIfAborted(signal);
  const locale = isLocale(req.locale) ? req.locale : 'ru';
  if (process.env.OPENAI_MOCK === '1') {
    return validateItinerary(mockItinerary(req), req.durationDays, locale);
  }

  const provider = resolveProvider();
  const userPrompt = buildUserPrompt(req, locale);
  const raw =
    provider.name === 'cursor'
      ? await generateWithCursor({
          apiKey: provider.apiKey,
          systemPrompt: systemPrompt(locale),
          userPrompt,
          schema: ITINERARY_SCHEMA,
          signal,
        })
      : await generateWithOpenAI(provider.apiKey, systemPrompt(locale), userPrompt, signal);

  return validateItinerary(raw, req.durationDays, locale);
}

async function generateWithOpenAI(apiKey: string, system: string, userPrompt: string, signal?: AbortSignal): Promise<unknown> {
  throwIfAborted(signal);
  const openai = getClient(apiKey);
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  const completion = await openai.chat.completions.create(
    {
      model,
      temperature: 0.7,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'itinerary', strict: true, schema: ITINERARY_SCHEMA },
      },
    },
    { signal },
  );

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
