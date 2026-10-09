import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from '@cursor/sdk';
import { HttpError } from '../errors.js';

interface CursorGenerateOptions {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  schema: object;
}

/** Пустая рабочая папка: агенту не нужен доступ к файлам проекта. */
const AGENT_CWD = join(tmpdir(), 'ai-travel-planner-agent');

/** Достаёт JSON-объект из ответа модели (допускает обёртку ```json … ``` и текст вокруг). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new HttpError(502, 'Модель Cursor не вернула JSON');
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
  } catch {
    throw new HttpError(502, 'Модель Cursor вернула некорректный JSON');
  }
}

/**
 * Генерация через Cursor SDK. Структурированный вывод SDK не гарантирует,
 * поэтому схема передаётся в промпте, а результат валидируется вызывающим кодом.
 */
export async function generateWithCursor({
  apiKey,
  systemPrompt,
  userPrompt,
  schema,
}: CursorGenerateOptions): Promise<unknown> {
  mkdirSync(AGENT_CWD, { recursive: true });

  const prompt = [
    systemPrompt,
    '',
    'Формат ответа: верни ТОЛЬКО один JSON-объект без пояснений и без markdown, строго по JSON Schema:',
    JSON.stringify(schema),
    '',
    'Запрос пользователя:',
    userPrompt,
  ].join('\n');

  const result = await Agent.prompt(prompt, {
    apiKey,
    model: { id: process.env.CURSOR_MODEL ?? 'composer-2.5' },
    name: 'AI Travel Planner — itinerary',
    tools: [],
    local: { cwd: AGENT_CWD, settingSources: [] },
  });

  if (result.status !== 'finished') {
    throw new HttpError(502, `Cursor: генерация завершилась со статусом "${result.status}"${result.error ? `: ${result.error.message}` : ''}`);
  }
  if (!result.result) {
    throw new HttpError(502, 'Пустой ответ от Cursor');
  }

  return extractJson(result.result);
}
