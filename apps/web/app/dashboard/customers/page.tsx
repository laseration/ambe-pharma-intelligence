import {
  listCustomerContactOpportunities,
  listCustomers,
} from '../../../lib/customersApi';
import { requireCurrentWebCapability } from '../../../lib/serverWebAuth';
import { CustomersDashboardContent } from './CustomersDashboardContent';

export const dynamic = 'force-dynamic';

type CustomersPageProps = {
  searchParams?: Promise<{
    q?: string;
    activeOnly?: string;
    page?: string;
  }>;
};

function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseBoolean(value: string | undefined): boolean {
  return value === 'true' || value === '1' || value === 'on';
}

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  await requireCurrentWebCapability('customers:view');

  const query = searchParams ? await searchParams : undefined;
  const filters = {
    q: query?.q?.trim() ?? '',
    activeOnly: parseBoolean(query?.activeOnly),
    page: parsePage(query?.page),
  };

  try {
    const [customers, contactOpportunities] = await Promise.all([
      listCustomers({
        q: filters.q || null,
        activeOnly: filters.activeOnly,
        page: filters.page,
        limit: 25,
      }),
      listCustomerContactOpportunities({ limit: 8 }),
    ]);

    return (
      <CustomersDashboardContent
        contactOpportunities={contactOpportunities}
        customers={customers}
        filters={filters}
      />
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Customers</p>
        <h2 className="title">Customer View Unavailable</h2>
        <p className="copy">
          {error instanceof Error
            ? error.message
            : 'Failed to load customer data.'}
        </p>
      </section>
    );
  }
}
