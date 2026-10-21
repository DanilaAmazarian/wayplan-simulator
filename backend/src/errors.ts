export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Клиент закрыл соединение, пока сервер ещё отвечал. Это не сбой модели. */
export class ClientDisconnectedError extends Error {
  constructor() {
    super('Клиент отменил запрос');
    this.name = 'AbortError';
  }
}

export function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('name' in err)) return false;
  return err.name === 'AbortError' || err.name === 'APIUserAbortError';
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ClientDisconnectedError();
}
