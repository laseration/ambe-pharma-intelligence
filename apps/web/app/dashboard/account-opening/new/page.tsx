import Link from 'next/link';

import { requireCurrentWebCapability } from '../../../../lib/serverWebAuth';
import { NewCaseFormClient } from './NewCaseFormClient';

export const dynamic = 'force-dynamic';

export default async function NewAccountOpeningCasePage() {
  await requireCurrentWebCapability('account-opening:manage');

  return (
    <section className="dashboard-layout">
      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Account Opening</p>
            <h2 className="title">New Account Opening Case</h2>
            <p className="copy">
              Create a case manually for a pack that arrived by WhatsApp, a
              forwarded email, a downloaded attachment, or a direct
              conversation. No documents are uploaded here yet — the case starts
              in review with Aman Dhillon as the default signatory, and nothing
              is signed or sent.
            </p>
          </div>
          <Link className="button" href="/dashboard/account-opening">
            Back to cases
          </Link>
        </div>

        <NewCaseFormClient />
      </section>
    </section>
  );
}
