import { getCustomer } from '../../../../lib/customersApi';
import { CustomerDetailContent } from './CustomerDetailContent';

export const dynamic = 'force-dynamic';

type CustomerDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  const { id } = await params;

  try {
    return <CustomerDetailContent customer={await getCustomer(id)} />;
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Customer Detail</p>
        <h2 className="title">Customer Detail Unavailable</h2>
        <p className="copy">
          {error instanceof Error
            ? error.message
            : 'Failed to load customer detail.'}
        </p>
      </section>
    );
  }
}
