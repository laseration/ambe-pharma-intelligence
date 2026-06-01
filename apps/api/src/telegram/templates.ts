import type { Opportunity } from '@prisma/client';

type OpportunityWithRelations = Opportunity & {
  product: { name: string } | null;
  supplier: { name: string } | null;
};

function formatLine(
  label: string,
  value: string | number | null | undefined,
): string {
  return `${label}: ${value ?? 'n/a'}`;
}

function buildOpportunityHeader(type: Opportunity['type']): string {
  switch (type) {
    case 'BUY':
      return '✅ BUY THIS';
    case 'PUSH':
      return '📦 TRY TO SELL THIS';
    case 'DEAD_STOCK':
      return '⚠️ SLOW STOCK';
    case 'LOW_MARGIN':
      return '💸 LOW PROFIT';
    case 'RESTOCK':
      return '🔁 RESTOCK THIS';
    case 'PRICE_ALERT':
      return '📉 PRICE CHANGE';
    default:
      return '📋 REVIEW THIS';
  }
}

function buildWhatToDo(type: Opportunity['type']): string {
  switch (type) {
    case 'BUY':
      return 'Check and buy if stock is needed';
    case 'PUSH':
      return 'Offer this to customers';
    case 'RESTOCK':
      return 'Reorder soon';
    case 'DEAD_STOCK':
      return 'Try to clear this stock';
    case 'LOW_MARGIN':
      return 'Review before buying or selling';
    case 'PRICE_ALERT':
      return 'Review this supplier price';
    default:
      return 'Review this signal';
  }
}

function formatSimplePrice(value: unknown): string | null {
  return typeof value === 'number' ? value.toFixed(2) : null;
}

export function buildOpportunityMessage(
  opportunity: OpportunityWithRelations,
): string {
  const metrics =
    opportunity.metadata &&
    typeof opportunity.metadata === 'object' &&
    !Array.isArray(opportunity.metadata) &&
    'metrics' in opportunity.metadata
      ? (opportunity.metadata as { metrics?: Record<string, unknown> }).metrics
      : undefined;

  const stock =
    typeof metrics?.currentStockQty === 'number'
      ? metrics.currentStockQty
      : null;
  const price = formatSimplePrice(metrics?.latestSupplierBuyPrice);
  const lines = [
    buildOpportunityHeader(opportunity.type),
    formatLine('Product', opportunity.product?.name ?? 'Unknown product'),
  ];

  if (
    opportunity.supplier?.name &&
    ['BUY', 'PRICE_ALERT'].includes(opportunity.type)
  ) {
    lines.push(formatLine('Supplier', opportunity.supplier.name));
  }

  if (price && ['BUY', 'PRICE_ALERT'].includes(opportunity.type)) {
    lines.push(formatLine('Price', price));
  }

  if (
    stock !== null &&
    ['PUSH', 'RESTOCK', 'DEAD_STOCK'].includes(opportunity.type)
  ) {
    lines.push(formatLine('Stock', stock));
  }

  lines.push(formatLine('Why', opportunity.description ?? 'Needs attention'));
  lines.push(formatLine('What to do', buildWhatToDo(opportunity.type)));

  return lines.join('\n');
}

export function buildDailySummaryMessage(
  opportunities: OpportunityWithRelations[],
  generatedAt: Date,
): string {
  const grouped = opportunities.reduce<Record<string, number>>(
    (counts, opportunity) => {
      counts[opportunity.type] = (counts[opportunity.type] ?? 0) + 1;
      return counts;
    },
    {},
  );

  const lines = [
    "📋 TODAY'S SIGNALS",
    formatLine('Generated', generatedAt.toISOString()),
    formatLine('Open opportunities', opportunities.length),
  ];

  for (const [type, count] of Object.entries(grouped).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    lines.push(`${type}: ${count}`);
  }

  const topOpportunity = [...opportunities].sort(
    (left, right) => right.score - left.score,
  )[0];
  if (topOpportunity) {
    lines.push('');
    lines.push('Top priority');
    lines.push(formatLine('Type', topOpportunity.type));
    lines.push(
      formatLine('Product', topOpportunity.product?.name ?? 'Unknown product'),
    );
    lines.push(
      formatLine('Why', topOpportunity.description ?? 'Needs attention'),
    );
    lines.push(formatLine('What to do', buildWhatToDo(topOpportunity.type)));
  }

  return lines.join('\n');
}
