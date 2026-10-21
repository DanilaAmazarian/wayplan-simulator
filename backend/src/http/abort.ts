import type { Response } from 'express';

/**
 * Сигнал обрыва клиента.
 * У входящего запроса `close` срабатывает, когда тело уже прочитано,
 * поэтому слушаем ответ: соединение закрылось раньше, чем ответ дописан.
 */
export function clientAbortSignal(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished && !res.writableEnded) controller.abort();
  });
  return controller.signal;
}
