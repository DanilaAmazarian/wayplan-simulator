import { Router } from 'express';
import { isLocale, type GenerateTripRequest, type UpdateTripRequest } from '@travel/shared';
import { HttpError } from '../errors.js';
import { clientAbortSignal } from '../http/abort.js';
import { requireUser } from '../http/session.js';
import {
  createOrGetShareLink,
  deleteTrip,
  generateAndSaveTrip,
  getTrip,
  listTrips,
  revokeShareLink,
  updateTrip,
} from '../services/trips.js';

const MAX_DAYS = 14;
const MAX_TITLE_LENGTH = 120;

function parseGenerateRequest(body: unknown): GenerateTripRequest {
  const { destination, durationDays, preferences, locale } = (body ?? {}) as Record<string, unknown>;

  if (typeof destination !== 'string' || destination.trim().length < 2) {
    throw new HttpError(400, 'Поле destination обязательно (название города)');
  }
  const days = Number(durationDays);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    throw new HttpError(400, `Поле durationDays должно быть целым числом от 1 до ${MAX_DAYS}`);
  }
  if (preferences !== undefined && typeof preferences !== 'string') {
    throw new HttpError(400, 'Поле preferences должно быть строкой');
  }
  if (locale !== undefined && !isLocale(locale)) {
    throw new HttpError(400, 'Поле locale должно быть ru или en');
  }

  return {
    destination: destination.trim(),
    durationDays: days,
    preferences: preferences?.trim().slice(0, 1000),
    locale: isLocale(locale) ? locale : 'ru',
  };
}

function parseUpdateRequest(body: unknown): UpdateTripRequest {
  const { title, saved } = (body ?? {}) as Record<string, unknown>;
  const update: UpdateTripRequest = {};

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new HttpError(400, 'Поле title должно быть непустой строкой');
    }
    update.title = title.trim().slice(0, MAX_TITLE_LENGTH);
  }
  if (saved !== undefined) {
    if (typeof saved !== 'boolean') throw new HttpError(400, 'Поле saved должно быть boolean');
    update.saved = saved;
  }
  if (Object.keys(update).length === 0) {
    throw new HttpError(400, 'Нечего обновлять: передайте title и/или saved');
  }
  return update;
}

function actorId(req: { userId?: string }): string {
  if (!req.userId) throw new HttpError(401, 'Нужно войти');
  return req.userId;
}

export const tripsRouter = Router();

tripsRouter.use(requireUser);

tripsRouter.get('/', async (req, res) => {
  const { saved } = req.query;
  res.json(
    await listTrips(actorId(req), { saved: saved === undefined ? undefined : saved === 'true' || saved === '1' }),
  );
});

tripsRouter.post('/generate', async (req, res) => {
  const signal = clientAbortSignal(res);
  const trip = await generateAndSaveTrip(parseGenerateRequest(req.body), actorId(req), signal);
  if (signal.aborted || res.writableEnded) return;
  res.status(201).json(trip);
});

tripsRouter.get('/:id', async (req, res) => {
  const trip = await getTrip(req.params.id, actorId(req));
  if (!trip) throw new HttpError(404, 'Поездка не найдена');
  res.json(trip);
});

tripsRouter.patch('/:id', async (req, res) => {
  res.json(await updateTrip(req.params.id, actorId(req), parseUpdateRequest(req.body)));
});

tripsRouter.delete('/:id', async (req, res) => {
  await deleteTrip(req.params.id, actorId(req));
  res.status(204).end();
});

tripsRouter.post('/:id/share', async (req, res) => {
  res.json(await createOrGetShareLink(req.params.id, actorId(req)));
});

tripsRouter.delete('/:id/share', async (req, res) => {
  await revokeShareLink(req.params.id, actorId(req));
  res.status(204).end();
});
