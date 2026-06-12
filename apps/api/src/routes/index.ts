import { Router } from 'express';

import { accountOpeningRouter } from '../accountOpening/routes';
import { automationRouter } from '../automation/routes';
import { buyDecisionsRouter } from '../buyDecisions/routes';
import { buyExecutionsRouter } from '../buyExecutions/routes';
import { correctionsRouter, sourceProfilesRouter } from '../corrections/routes';
import { customersRouter } from '../customers/routes';
import { dealsRouter } from '../deals/routes';
import { emailRouter } from '../email/routes';
import { supplierContactRouter } from '../email/inbound/supplierContactRoutes';
import { requireInternalViewerAccess } from '../http/auth';
import { importsRouter } from '../imports/routes';
import { inventoryRouter } from '../inventory/routes';
import { opportunitiesRouter } from '../opportunities/routes';
import { productsRouter } from '../products/routes';
import { regulatoryRouter } from '../regulatory/routes';
import { reviewQueueRouter } from '../reviewQueue/routes';
import { suppliersRouter } from '../suppliers/routes';
import { systemRouter } from '../system/routes';
import { telegramRouter } from '../telegram/routes';
import { tradeEnquiriesRouter } from '../tradeEnquiries/routes';

export const apiRouter = Router();

apiRouter.use(requireInternalViewerAccess);

apiRouter.use('/account-opening', accountOpeningRouter);
apiRouter.use('/automation', automationRouter);
apiRouter.use('/email/inbound/supplier-contacts', supplierContactRouter);
apiRouter.use('/email', emailRouter);
apiRouter.use('/buy-decisions', buyDecisionsRouter);
apiRouter.use('/buy-executions', buyExecutionsRouter);
apiRouter.use('/corrections', correctionsRouter);
apiRouter.use('/deals', dealsRouter);
apiRouter.use('/imports', importsRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/regulatory', regulatoryRouter);
apiRouter.use('/sources', sourceProfilesRouter);
apiRouter.use('/suppliers', suppliersRouter);
apiRouter.use('/system', systemRouter);
apiRouter.use('/trade', tradeEnquiriesRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/customers', customersRouter);
apiRouter.use('/opportunities', opportunitiesRouter);
apiRouter.use('/review-queue', reviewQueueRouter);
apiRouter.use('/telegram', telegramRouter);
