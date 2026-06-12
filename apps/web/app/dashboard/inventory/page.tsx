import { listInventory, listStockRisk } from '../../../lib/inventoryApi';
import { requireCurrentWebCapability } from '../../../lib/serverWebAuth';
import { InventoryDashboardContent } from './InventoryDashboardContent';

export const dynamic = 'force-dynamic';

type InventoryPageProps = {
  searchParams?: Promise<{
    q?: string;
    lowStockOnly?: string;
    staleOnly?: string;
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

export default async function InventoryPage({
  searchParams,
}: InventoryPageProps) {
  await requireCurrentWebCapability('inventory:view');

  const query = searchParams ? await searchParams : undefined;
  const filters = {
    q: query?.q?.trim() ?? '',
    lowStockOnly: parseBoolean(query?.lowStockOnly),
    staleOnly: parseBoolean(query?.staleOnly),
    page: parsePage(query?.page),
  };

  try {
    const [inventory, stockRisk] = await Promise.all([
      listInventory({
        q: filters.q || null,
        lowStockOnly: filters.lowStockOnly,
        staleOnly: filters.staleOnly,
        page: filters.page,
        limit: 25,
      }),
      listStockRisk({ limit: 8 }),
    ]);

    return (
      <InventoryDashboardContent
        filters={filters}
        inventory={inventory}
        stockRisk={stockRisk}
      />
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Inventory</p>
        <h2 className="title">Inventory View Unavailable</h2>
        <p className="copy">
          {error instanceof Error
            ? error.message
            : 'Failed to load inventory data.'}
        </p>
      </section>
    );
  }
}
