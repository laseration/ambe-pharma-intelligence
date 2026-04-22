import assert from 'node:assert/strict';
import test from 'node:test';

import { validateSupplierPriceRows } from '../validators';

test('supplier price validator captures manufacturer-like columns', () => {
  const result = validateSupplierPriceRows(
    [
      {
        productName: 'Amlodipine 5mg Tablets 28',
        unitPrice: '8.40',
        manufacturer: 'Teva',
      },
    ],
    'GBP',
  );

  assert.equal(result.errors.length, 0);
  assert.equal(result.validRows[0]?.manufacturer, 'Teva');
});
