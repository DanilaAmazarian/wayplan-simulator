import 'dotenv/config';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import OpenAI from 'openai';
import { AuthenticationError, CursorAgentError, RateLimitError } from '@cursor/sdk';
import type { ApiError } from '@travel/shared';
import { HttpError, isAbortError } from './errors.js';
import { authRouter } from './routes/auth.js';
import { shareRouter } from './routes/share.js';
import { tripsRouter } from './routes/trips.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  }),
);
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/share', shareRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (isAbortError(err)) {
    if (!res.writableEnded) res.destroy();
    return;
  }
  if (res.writableEnded) return;

  let status = 500;
  let message = 'Внутренняя ошибка сервера';

  if (err instanceof HttpError) {
    status = err.status;
    message = err.message;
  } else if (err instanceof CursorAgentError) {
    status = err instanceof AuthenticationError ? 503 : err instanceof RateLimitError ? 429 : 502;
    message =
      err instanceof AuthenticationError
        ? 'Ключ Cursor API недействителен — проверьте CURSOR_API_KEY в backend/.env'
        : err instanceof RateLimitError
          ? 'Лимит Cursor API исчерпан — попробуйте позже'
          : `Ошибка Cursor: ${err.message}`;
  } else if (err instanceof OpenAI.APIError) {
    status = err.status === 401 ? 503 : err.status === 429 ? 429 : 502;
    message =
      err.code === 'insufficient_quota' || err.type === 'insufficient_quota'
        ? 'На аккаунте OpenAI закончились кредиты — пополните баланс или включите OPENAI_MOCK=1'
        : `Ошибка OpenAI: ${err.message}`;
  }

  if (status >= 500) console.error(err);
  const body: ApiError = { error: message };
  res.status(status).json(body);
};

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
