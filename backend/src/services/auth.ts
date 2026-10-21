import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { AuthUser, LoginRequest, RegisterRequest } from '@travel/shared';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export const SESSION_COOKIE = 'session';
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_MAX_AGE_MS);
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const hash = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}.${hash.toString('base64url')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split('.');
  if (!salt || !hash) return false;
  const actual = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(hash, 'base64url');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function toAuthUser(user: { id: string; email: string; name: string | null }): AuthUser {
  return { id: user.id, email: user.email, name: user.name ?? undefined };
}

function isUniqueEmail(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

async function openSession(userId: string): Promise<string> {
  const token = newToken();
  await prisma.session.create({
    data: { tokenHash: hashToken(token), expiresAt: sessionExpiry(), userId },
  });
  return token;
}

export async function register(input: RegisterRequest): Promise<{ user: AuthUser; token: string }> {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name ?? null,
        passwordHash,
      },
    });
    const token = await openSession(user.id);
    return { user: toAuthUser(user), token };
  } catch (error) {
    if (isUniqueEmail(error)) throw new HttpError(409, 'Аккаунт с таким email уже есть');
    throw error;
  }
}

export async function login(input: LoginRequest): Promise<{ user: AuthUser; token: string }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new HttpError(401, 'Неверный email или пароль');
  }
  const token = await openSession(user.id);
  return { user: toAuthUser(user), token };
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function currentUser(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return toAuthUser(session.user);
}
