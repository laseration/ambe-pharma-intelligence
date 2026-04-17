import { Router } from 'express';

import { importsRouter } from '../imports/routes';
import { createPlaceholderRouter } from './createPlaceholderRouter';

export const apiRouter = Router();

apiRouter.use('/imports', importsRouter);
apiRouter.use('/products', createPlaceholderRouter('products'));
apiRouter.use('/suppliers', createPlaceholderRouter('suppliers'));
apiRouter.use('/inventory', createPlaceholderRouter('inventory'));
apiRouter.use('/customers', createPlaceholderRouter('customers'));
apiRouter.use('/opportunities', createPlaceholderRouter('opportunities'));
apiRouter.use('/telegram', createPlaceholderRouter('telegram'));
