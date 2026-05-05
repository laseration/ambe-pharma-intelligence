import { Router } from 'express';

import { automationRouter } from '../automation/routes';
import { buyDecisionsRouter } from '../buyDecisions/routes';
import { buyExecutionsRouter } from '../buyExecutions/routes';
import { commercialIntelRouter } from '../commercialIntel/routes';
import { correctionsRouter, sourceProfilesRouter } from '../corrections/routes';
import { dealsRouter } from '../deals/routes';
import { diagnosticsRouter } from '../diagnostics/routes';
import { emailRouter } from '../email/routes';
import { requireInternalViewerAccess } from '../http/auth';
import { importsRouter } from '../imports/routes';
import { opportunitiesRouter } from '../opportunities/routes';
import { productsRouter } from '../products/routes';
import { regulatoryRouter } from '../regulatory/routes';
import { reviewQueueRouter } from '../reviewQueue/routes';
import { suppliersRouter } from '../suppliers/routes';
import { telegramRouter } from '../telegram/routes';
import { createPlaceholderRouter } from './createPlaceholderRouter';

export const apiRouter = Router();

apiRouter.use(requireInternalViewerAccess);

apiRouter.use('/automation', automationRouter);
apiRouter.use('/email', emailRouter);
apiRouter.use('/buy-decisions', buyDecisionsRouter);
apiRouter.use('/buy-executions', buyExecutionsRouter);
apiRouter.use('/commercial-intel', commercialIntelRouter);
apiRouter.use('/corrections', correctionsRouter);
apiRouter.use('/deals', dealsRouter);
apiRouter.use('/diagnostics', diagnosticsRouter);
apiRouter.use('/imports', importsRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/regulatory', regulatoryRouter);
apiRouter.use('/sources', sourceProfilesRouter);
apiRouter.use('/suppliers', suppliersRouter);
apiRouter.use('/inventory', createPlaceholderRouter('inventory'));
apiRouter.use('/customers', createPlaceholderRouter('customers'));
apiRouter.use('/opportunities', opportunitiesRouter);
apiRouter.use('/review-queue', reviewQueueRouter);
apiRouter.use('/telegram', telegramRouter);
