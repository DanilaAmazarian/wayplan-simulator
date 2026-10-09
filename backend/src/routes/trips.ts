import { Router } from 'express';
import type { GenerateTripRequest, UpdateTripRequest } from '@travel/shared';
import { HttpError } from '../errors.js';
import { deleteTrip, generateAndSaveTrip, getTrip, listTrips, updateTrip } from '../services/trips.js';

const MAX_DAYS = 14;
const MAX_TITLE_LENGTH = 120;

function parseGenerateRequest(body: unknown): GenerateTripRequest {
  const { destination, durationDays, preferences } = (body ?? {}) as Record<string, unknown>;

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

  return {
    destination: destination.trim(),
    durationDays: days,
    preferences: preferences?.trim().slice(0, 1000),
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

export const tripsRouter = Router();

tripsRouter.get('/', async (req, res) => {
  const { saved } = req.query;
  res.json(await listTrips({ saved: saved === undefined ? undefined : saved === 'true' || saved === '1' }));
});

tripsRouter.post('/generate', async (req, res) => {
  const trip = await generateAndSaveTrip(parseGenerateRequest(req.body));
  res.status(201).json(trip);
});

tripsRouter.get('/:id', async (req, res) => {
  const trip = await getTrip(req.params.id);
  if (!trip) throw new HttpError(404, 'Поездка не найдена');
  res.json(trip);
});

tripsRouter.patch('/:id', async (req, res) => {
  const trip = await updateTrip(req.params.id, parseUpdateRequest(req.body));
  if (!trip) throw new HttpError(404, 'Поездка не найдена');
  res.json(trip);
});

tripsRouter.delete('/:id', async (req, res) => {
  if (!(await deleteTrip(req.params.id))) throw new HttpError(404, 'Поездка не найдена');
  res.status(204).end();
});
