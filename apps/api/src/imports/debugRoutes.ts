import { Router } from 'express';

import { normalizeMedicineName } from './normalization';

export const importsDebugRouter = Router();

importsDebugRouter.get('/normalize', (request, response) => {
  const rawInput = request.query.input;
  const inputs = Array.isArray(rawInput)
    ? rawInput.filter((value): value is string => typeof value === 'string')
    : typeof rawInput === 'string'
      ? [rawInput]
      : [];

  if (inputs.length === 0) {
    response.status(400).json({
      error: 'Provide at least one ?input= query value.',
    });
    return;
  }

  response.json({
    results: inputs.map((input) => normalizeMedicineName(input)),
  });
});
