# Import Templates

Use these CSV/XLSX layouts for pilot imports. The importer keeps source file metadata and row snapshots for failed rows, but it does not store the full uploaded file.

The API currently accepts files up to 10 MB.

## Supplier Price List

Required:

- `productName` or `Description`
- `unitPrice` or `Unit Cost`

Recommended:

- `supplierName` or upload form field `supplierName`
- `manufacturer`
- `currencyCode`
- `minimumOrderQuantity` or `MOQ`
- `isAvailable`
- `packDescription`

Example:

```csv
productName,manufacturer,unitPrice,currencyCode,minimumOrderQuantity,isAvailable,supplierName
Amlodipine 5mg Tablets 28,Generic Labs,7.95,GBP,50,yes,Example Supplier
```

## Inventory

Required:

- `productName` or `Description`
- `warehouseCode`
- `snapshotDate`
- `quantityOnHand`

Recommended:

- `quantityReserved`
- `quantityAvailable`
- `unitCost`
- `totalValue`
- `supplierName`
- `manufacturer`

Example:

```csv
productName,warehouseCode,snapshotDate,quantityOnHand,quantityReserved,quantityAvailable,unitCost,totalValue
Amlodipine 5mg Tablets 28,MAIN,2026-04-30,120,20,100,6.50,780
```

## Sales

Required:

- `saleDate`
- `customerName`
- `productName` or `Description`
- `quantity`
- `unitPrice`

Recommended:

- `totalRevenue`
- `currencyCode`
- `supplierName`
- `manufacturer`

Example:

```csv
saleDate,customerName,productName,quantity,unitPrice,totalRevenue,currencyCode
2026-04-30,Example Pharmacy,Amlodipine 5mg Tablets 28,12,9.95,119.40,GBP
```

## Common Fixes

- Keep one clear header row. Title rows above the header are tolerated, but clear headers reduce parser warnings.
- Use plain numbers for prices and quantities. Avoid currency symbols in numeric cells.
- Use ISO dates such as `2026-04-30`.
- Keep product descriptions specific enough to include strength, dosage form, and pack size where available.
- Review duplicate product candidate groups after import; they may indicate duplicate rows or alias variants.
- If product matching is blocked, add clearer product identity fields before re-importing rather than letting the system create uncertain canonical products.
