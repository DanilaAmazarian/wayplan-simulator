import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from '@cursor/sdk';
import { ClientDisconnectedError, HttpError, isAbortError, throwIfAborted } from '../errors.js';

interface CursorGenerateOptions {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  schema: object;
  signal?: AbortSignal;
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
 * Генерация через Cursor SDK. `Agent.prompt` нельзя прервать,
 * поэтому агент создаётся явно и на обрыв клиента вызывается `run.cancel()`.
 * Схема в промпте: SDK не гарантирует структурированный вывод, результат проверяет вызывающий код.
 */
export async function generateWithCursor({
  apiKey,
  systemPrompt,
  userPrompt,
  schema,
  signal,
}: CursorGenerateOptions): Promise<unknown> {
  mkdirSync(AGENT_CWD, { recursive: true });
  throwIfAborted(signal);

  const prompt = [
    systemPrompt,
    '',
    'Формат ответа: верни ТОЛЬКО один JSON-объект без пояснений и без markdown, строго по JSON Schema:',
    JSON.stringify(schema),
    '',
    'Запрос пользователя:',
    userPrompt,
  ].join('\n');

  const agent = await Agent.create({
    apiKey,
    model: { id: process.env.CURSOR_MODEL ?? 'composer-2.5' },
    name: 'AI Travel Planner — itinerary',
    // Пустой список отключает инструменты. С webSearch недельный маршрут
    // занимает несколько минут и на сервере соединение обрывается.
    tools: [],
    local: { cwd: AGENT_CWD, settingSources: [] },
  });

  let onAbort: (() => void) | undefined;
  try {
    throwIfAborted(signal);
    const run = await agent.send(prompt);
    onAbort = () => {
      if (!run.supports('cancel')) return;
      void run.cancel().catch((error: unknown) => {
        console.warn('[cursor] не удалось отменить генерацию', error);
      });
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });

    const result = await run.wait();
    if (signal?.aborted || result.status === 'cancelled') throw new ClientDisconnectedError();
    if (result.status !== 'finished') {
      throw new HttpError(
        502,
        `Cursor: генерация завершилась со статусом "${result.status}"${result.error ? `: ${result.error.message}` : ''}`,
      );
    }
    if (!result.result) throw new HttpError(502, 'Пустой ответ от Cursor');
    return extractJson(result.result);
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw new ClientDisconnectedError();
    throw error;
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    await agent[Symbol.asyncDispose]().catch((error: unknown) => {
      console.warn('[cursor] не удалось закрыть агента', error);
    });
  }
}
