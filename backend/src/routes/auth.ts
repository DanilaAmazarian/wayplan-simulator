import { Router } from 'express';
import type { LoginRequest, RegisterRequest } from '@travel/shared';
import { HttpError } from '../errors.js';
import { clearSessionCookie, readSessionToken, setSessionCookie } from '../http/session.js';
import { currentUser, login, logout, register } from '../services/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAuthBody(body: unknown, withName: boolean): RegisterRequest {
  const { email, password, name } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.trim().length > 254) {
    throw new HttpError(400, 'Укажите корректный email');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    throw new HttpError(400, 'Пароль должен быть от 8 до 200 символов');
  }

  const parsed: RegisterRequest = { email: email.trim().toLowerCase(), password };
  if (!withName || name === undefined || name === '') return parsed;
  if (typeof name !== 'string' || name.trim().length > 80) {
    throw new HttpError(400, 'Имя — не длиннее 80 символов');
  }
  const trimmed = name.trim();
  if (trimmed) parsed.name = trimmed;
  return parsed;
}

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { user, token } = await register(parseAuthBody(req.body, true));
  setSessionCookie(res, token);
  res.status(201).json(user);
});

authRouter.post('/login', async (req, res) => {
  const body = parseAuthBody(req.body, false) satisfies LoginRequest;
  const { user, token } = await login(body);
  setSessionCookie(res, token);
  res.json(user);
});

authRouter.post('/logout', async (req, res) => {
  await logout(readSessionToken(req));
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', async (req, res) => {
  const user = await currentUser(readSessionToken(req));
  if (!user) throw new HttpError(401, 'Нужно войти');
  res.json(user);
});
