import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInventoryListPath,
  buildStockRiskPath,
} from './inventoryApiPaths';

test('inventory API client builds list query paths with safe filters', () => {
  assert.equal(buildInventoryListPath(), '/inventory');
  assert.equal(
    buildInventoryListPath({
      q: ' atorvastatin ',
      productId: 'product-1',
      supplierId: 'supplier-1',
      lowStockOnly: true,
      staleOnly: false,
      limit: 25,
      page: 2,
    }),
    '/inventory?q=atorvastatin&productId=product-1&supplierId=supplier-1&lowStockOnly=true&staleOnly=false&limit=25&page=2',
  );
});

test('inventory API client omits empty optional query values', () => {
  assert.equal(
    buildInventoryListPath({
      q: '   ',
      productId: '',
      supplierId: null,
      lowStockOnly: null,
      staleOnly: undefined,
    }),
    '/inventory',
  );
});

test('inventory API client builds stock-risk query paths', () => {
  assert.equal(buildStockRiskPath(), '/inventory/stock-risk');
  assert.equal(
    buildStockRiskPath({ limit: 8 }),
    '/inventory/stock-risk?limit=8',
  );
});
