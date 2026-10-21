import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../errors.js';
import { SESSION_COOKIE, SESSION_MAX_AGE_MS, currentUser } from '../services/auth.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_MS,
};

export function readSessionToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions);
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' });
}

export async function requireUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await currentUser(readSessionToken(req));
    if (!user) {
      next(new HttpError(401, 'Нужно войти'));
      return;
    }
    req.userId = user.id;
    next();
  } catch (error) {
    next(error);
  }
}
