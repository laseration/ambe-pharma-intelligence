import { listAccountOpeningCases } from '../../../lib/accountOpeningApi';
import { requireCurrentWebCapability } from '../../../lib/serverWebAuth';
import {
  ACCOUNT_OPENING_STATUS_FILTERS,
  AccountOpeningCasesContent,
} from './AccountOpeningCasesContent';

export const dynamic = 'force-dynamic';

type AccountOpeningListPageProps = {
  searchParams?: Promise<{
    status?: string;
    q?: string;
  }>;
};

function parseStatus(value: string | undefined): string {
  return value &&
    (ACCOUNT_OPENING_STATUS_FILTERS as readonly string[]).includes(value)
    ? value
    : '';
}

export default async function AccountOpeningListPage({
  searchParams,
}: AccountOpeningListPageProps) {
  await requireCurrentWebCapability('account-opening:view');

  const query = searchParams ? await searchParams : undefined;
  const filters = {
    status: parseStatus(query?.status),
    q: query?.q?.trim() ?? '',
  };

  try {
    const cases = await listAccountOpeningCases({
      status: filters.status || undefined,
      search: filters.q || undefined,
      limit: 100,
    });

    return <AccountOpeningCasesContent cases={cases} filters={filters} />;
  } catch {
    return (
      <section className="panel">
        <p className="eyebrow">Account Opening</p>
        <h2 className="title">Account Opening View Unavailable</h2>
        <p className="copy">
          Failed to load account-opening cases. Check the internal API
          connection and try again.
        </p>
      </section>
    );
  }
}
