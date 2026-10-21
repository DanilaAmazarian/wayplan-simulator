import { Router } from 'express';
import { HttpError } from '../errors.js';
import { getTripByShareToken } from '../services/trips.js';

export const shareRouter = Router();

shareRouter.get('/:token', async (req, res) => {
  const trip = await getTripByShareToken(req.params.token);
  if (!trip) throw new HttpError(404, 'Ссылка недействительна или отозвана');
  res.json(trip);
});
