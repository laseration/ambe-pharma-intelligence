import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyInboundDocument } from '../inbound/documentClassifier';

describe('classifyInboundDocument', () => {
  it('routes account-opening forms to internal review only', () => {
    const decision = classifyInboundDocument({
      fromEmail: 'forms@supplier.example',
      senderDomain: 'supplier.example',
      subject: 'New account opening form',
      bodyText:
        'Please complete our credit account application with company registration and VAT number.',
      attachments: [
        {
          fileName: 'credit-account-application.pdf',
          fileType: 'PDF',
          mimeType: 'application/pdf',
        },
      ],
      attachmentTexts: [
        {
          fileName: 'credit-account-application.pdf',
          text: 'New account application. Company number. VAT number. Direct Debit section. Signature.',
        },
      ],
      trustedSender: true,
    });

    assert.equal(decision.primaryClass, 'ACCOUNT_OPENING_FORM');
    assert.equal(decision.routing, 'ACCOUNT_OPENING_REVIEW');
    assert.equal(decision.safeToAutoRoute, true);
    assert.match(decision.reason, /internal review only/i);
    assert.match(decision.reason, /no signing/i);
  });

  it('classifies supplier price lists from filename and table headers', () => {
    const decision = classifyInboundDocument({
      fromEmail: 'offers@supplier.example',
      senderDomain: 'supplier.example',
      subject: 'Weekly price list',
      attachments: [
        {
          fileName: 'supplier-price-list.csv',
          fileType: 'CSV',
          mimeType: 'text/csv',
        },
      ],
      tables: [
        {
          fileName: 'supplier-price-list.csv',
          headers: [
            'Product Code',
            'Description',
            'Unit Price',
            'Available Qty',
            'Expiry',
          ],
        },
      ],
      trustedSender: true,
      knownSupplierMappings: [
        { domain: 'supplier.example', supplierName: 'Example Supplier' },
      ],
    });

    assert.equal(decision.primaryClass, 'SUPPLIER_PRICE_LIST');
    assert.equal(decision.routing, 'SUPPLIER_IMPORT');
    assert.equal(decision.confidence, 'HIGH');
    assert.equal(decision.safeToAutoRoute, true);
    assert.equal(decision.conflicts.length, 0);
  });

  it('routes supplier contact forms to review instead of import automation', () => {
    const decision = classifyInboundDocument({
      fromEmail: 'onboarding@supplier.example',
      subject: 'Supplier contact details form',
      attachments: [
        { fileName: 'supplier-contact-details.xlsx', fileType: 'XLSX' },
      ],
      tables: [
        { headers: ['Supplier Name', 'Contact Email', 'Telephone', 'Address'] },
      ],
    });

    assert.equal(decision.primaryClass, 'SUPPLIER_CONTACT_FORM');
    assert.equal(decision.routing, 'SUPPLIER_CONTACT_REVIEW');
    assert.equal(decision.safeToAutoRoute, false);
  });

  it('routes supplier onboarding and KYC material to review', () => {
    const decision = classifyInboundDocument({
      fromEmail: 'kyc@supplier.example',
      subject: 'Supplier onboarding questionnaire and KYC',
      bodyText:
        'Please review our due diligence and vendor registration information.',
      attachments: [
        { fileName: 'supplier-onboarding-kyc.pdf', fileType: 'PDF' },
      ],
    });

    assert.equal(decision.primaryClass, 'SUPPLIER_ONBOARDING_OR_KYC');
    assert.equal(decision.routing, 'SUPPLIER_ONBOARDING_REVIEW');
    assert.equal(decision.safeToAutoRoute, false);
  });

  it('sends mixed account-opening and price-list signals to manual review', () => {
    const decision = classifyInboundDocument({
      fromEmail: 'forms@supplier.example',
      subject: 'New account form and weekly price list',
      bodyText: 'Attached is the account opening form and our stock offer.',
      attachments: [
        { fileName: 'account-opening-form.pdf', fileType: 'PDF' },
        { fileName: 'price-list.csv', fileType: 'CSV' },
      ],
      attachmentTexts: [
        {
          fileName: 'account-opening-form.pdf',
          text: 'Credit account application. Signature.',
        },
      ],
      tables: [
        {
          fileName: 'price-list.csv',
          headers: ['Product', 'Unit Price', 'Available Qty'],
        },
      ],
    });

    assert.equal(decision.primaryClass, 'UNKNOWN_OR_AMBIGUOUS');
    assert.equal(decision.routing, 'MANUAL_REVIEW');
    assert.equal(decision.safeToAutoRoute, false);
    assert.ok(
      decision.conflicts.some((conflict) =>
        conflict.includes('ACCOUNT_OPENING_FORM'),
      ),
    );
  });

  it('distinguishes inventory and sales reports from supplier price lists', () => {
    const inventory = classifyInboundDocument({
      subject: 'Warehouse stock report',
      tables: [
        {
          headers: ['Product', 'Warehouse', 'Stock On Hand', 'Batch', 'Expiry'],
        },
      ],
    });
    const sales = classifyInboundDocument({
      subject: 'Monthly sales report',
      tables: [
        { headers: ['Customer', 'Product', 'Sold Qty', 'Revenue', 'Period'] },
      ],
    });

    assert.equal(inventory.primaryClass, 'INVENTORY_REPORT');
    assert.equal(inventory.routing, 'INVENTORY_IMPORT');
    assert.equal(sales.primaryClass, 'SALES_REPORT');
    assert.equal(sales.routing, 'SALES_IMPORT');
  });

  it('classifies clear invoice-like documents as archiveable non-import material', () => {
    const decision = classifyInboundDocument({
      fromEmail: 'accounts@supplier.example',
      subject: 'Invoice INV-12345',
      attachments: [{ fileName: 'invoice-12345.pdf', fileType: 'PDF' }],
    });

    assert.equal(decision.primaryClass, 'INVOICE');
    assert.equal(decision.routing, 'ARCHIVE_OR_IGNORE');
    assert.equal(decision.safeToAutoRoute, true);
  });

  it('treats weak or unknown evidence as manual review', () => {
    const decision = classifyInboundDocument({
      fromEmail: 'person@example.com',
      subject: 'Documents attached',
      attachments: [{ fileName: 'documents.zip', fileType: 'UNKNOWN' }],
    });

    assert.equal(decision.primaryClass, 'UNKNOWN_OR_AMBIGUOUS');
    assert.equal(decision.routing, 'MANUAL_REVIEW');
    assert.equal(decision.safeToAutoRoute, false);
  });
});
