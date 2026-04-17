import { Router } from 'express';

export function createPlaceholderRouter(resource: string): Router {
  const router = Router();

  router.get('/', (_request, response) => {
    response.json({
      resource,
      items: [],
      message: `${resource} endpoint placeholder`,
    });
  });

  return router;
}
