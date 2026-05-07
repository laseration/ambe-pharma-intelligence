import assert from 'node:assert/strict';
import test from 'node:test';

import { runBlindBrokerPolicyCheck } from '../service';

test('outbound buyer draft blocks supplier identity and contact leakage', () => {
  const result = runBlindBrokerPolicyCheck({
    scope: 'OUTBOUND_DRAFT',
    direction: 'TO_BUYER',
    textParts: [
      {
        label: 'body',
        text: 'Supplier One can do this. Email pricing@supplier.test or call +44 20 7946 0000.',
      },
    ],
    supplierTerms: ['Supplier One'],
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.flags.containsSupplierIdentity, true);
  assert.equal(result.flags.containsExternalContactDetails, true);
  assert.match(JSON.stringify(result.findings), /supplier_identity_detected/);
  assert.match(JSON.stringify(result.findings), /email_address_detected/);
  assert.match(JSON.stringify(result.findings), /phone_number_detected/);
});

test('outbound supplier draft blocks buyer identity, address, and bank details', () => {
  const result = runBlindBrokerPolicyCheck({
    scope: 'OUTBOUND_DRAFT',
    direction: 'TO_SUPPLIER',
    textParts: [
      {
        label: 'body',
        text: 'Buyer Ltd at 10 High Street needs this. Payment details include IBAN GB29 NWBK 6016 1331 9268 19.',
      },
    ],
    buyerTerms: ['Buyer Ltd'],
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.flags.containsBuyerIdentity, true);
  assert.equal(result.flags.containsAddressOrLocation, true);
  assert.equal(result.flags.containsPaymentDetails, true);
  assert.match(JSON.stringify(result.findings), /buyer_identity_detected/);
  assert.match(JSON.stringify(result.findings), /address_or_location_detected/);
  assert.match(JSON.stringify(result.findings), /bank_payment_details_detected/);
});

test('staged offer policy check records non-blocking identity evidence but blocks payment details', () => {
  const result = runBlindBrokerPolicyCheck({
    scope: 'STAGED_OFFER',
    direction: 'UNKNOWN',
    textParts: [
      {
        label: 'source block',
        text: 'Supplier One offers Paracetamol. Bank details available on request.',
      },
    ],
    supplierTerms: ['Supplier One'],
    attachmentFileNames: ['Supplier One price list.xlsx'],
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.findings.some((finding) => finding.code === 'supplier_identity_detected' && !finding.blocking), true);
  assert.equal(result.findings.some((finding) => finding.code === 'attachment_filename_identity_leak'), true);
  assert.equal(result.findings.some((finding) => finding.code === 'bank_payment_details_detected' && finding.blocking), true);
});
