import type { Metadata } from 'next';

import { buildPublicMetadata } from '../seo';
import { submitTradeAccessRequirementAction } from './actions';
import { initialTradeAccessFormState } from './state';
import { TradeAccessPageContent } from './TradeAccessPageContent';

export const metadata: Metadata = buildPublicMetadata({
  path: '/trade-access',
  title: 'B2B Trade Access & RFQ | Ambe Medical Group',
  description:
    'Submit a B2B pharmaceutical trade or comparator sourcing requirement for manual review by Ambe Medical Group.',
  openGraphTitle: 'B2B Trade Access & RFQ | Ambe Medical Group',
  openGraphDescription:
    'A conservative route for buyers to submit pharmaceutical trade and comparator sourcing requirements for manual review.',
});

export default function TradeAccessPage() {
  return (
    <TradeAccessPageContent
      formAction={submitTradeAccessRequirementAction}
      initialFormState={initialTradeAccessFormState}
    />
  );
}
