import { Router } from 'express';

import { createPlaceholderRouter } from './createPlaceholderRouter';

export const apiRouter = Router();

apiRouter.use('/products', createPlaceholderRouter('products'));
apiRouter.use('/suppliers', createPlaceholderRouter('suppliers'));
apiRouter.use('/inventory', createPlaceholderRouter('inventory'));
apiRouter.use('/customers', createPlaceholderRouter('customers'));
apiRouter.use('/opportunities', createPlaceholderRouter('opportunities'));
apiRouter.use('/telegram', createPlaceholderRouter('telegram'));
