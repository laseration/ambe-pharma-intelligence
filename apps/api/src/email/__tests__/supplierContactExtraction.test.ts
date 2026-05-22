import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractSupplierContact } from '../inbound/supplierContactExtraction';

describe('extractSupplierContact', () => {
  it('stages mapped supplier contact evidence without auto-accepting it', () => {
    const result = extractSupplierContact({
      fromEmail: 'jane@delta-pharma.eu',
      fromName: 'Jane Buyer',
      supplierMappings: [
        { pattern: '@delta-pharma.eu', supplierName: 'Delta Pharma' },
      ],
      bodyText: [
        'Kind regards',
        'Jane Buyer',
        'Sales Manager',
        'Delta Pharma Ltd',
        'jane@delta-pharma.eu',
        '+44 20 7000 1111',
      ].join('\n'),
      internalDomains: ['ambemedical.com'],
    });

    assert.equal(result.supplierNameCandidate, 'Delta Pharma');
    assert.equal(result.normalizedSupplierName, 'delta pharma');
    assert.equal(result.contactEmail, 'jane@delta-pharma.eu');
    assert.equal(result.contactName, 'Jane Buyer');
    assert.equal(result.contactPhoneCanonical, '+442070001111');
    assert.equal(result.status, 'STAGED');
    assert.equal(result.autoAttached, false);
    assert.equal(result.conflicts.length, 0);
    assert.ok(
      result.evidence.some((item) => item.sourceType === 'TRUSTED_MAPPING'),
    );
  });

  it('ignores generic email domains as supplier identity evidence', () => {
    const result = extractSupplierContact({
      fromEmail: 'supplierbroker@gmail.com',
      fromName: 'Supplier Broker',
    });

    assert.equal(result.supplierNameCandidate, null);
    assert.equal(result.contactEmail, null);
    assert.match(result.reason, /requires review/i);
  });

  it('ignores internal company domains when resolving external supplier identity', () => {
    const result = extractSupplierContact({
      fromEmail: 'operator@ambemedical.com',
      fromName: 'AMBE Operator',
      bodyText: 'Forwarded supplier details attached.',
      internalDomains: ['ambemedical.com'],
    });

    assert.equal(result.supplierNameCandidate, null);
    assert.equal(result.contactEmail, null);
  });

  it('uses RFC 5322 and forwarded headers with provenance', () => {
    const result = extractSupplierContact({
      fromEmail: 'operator@ambemedical.com',
      internalDomains: ['ambemedical.com'],
      internetMessageHeaders: [
        {
          name: 'Reply-To',
          value: 'Carl Junius <carl.junius@delta-pharma.eu>',
        },
      ],
      bodyText: [
        'Forwarded message',
        'From: Sarah Smith <sarah@delta-pharma.eu>',
        'Subject: Supplier contact details',
      ].join('\n'),
    });

    assert.equal(result.contactEmail, null);
    assert.ok(
      result.evidence.some((item) => item.sourceType === 'RFC5322_HEADER'),
    );
    assert.ok(
      result.evidence.some((item) => item.sourceType === 'FORWARDED_HEADER'),
    );
    assert.ok(
      result.conflicts.some((conflict) =>
        conflict.includes('conflicting contact email'),
      ),
    );
  });

  it('abstains when supplier names conflict closely', () => {
    const result = extractSupplierContact({
      fromEmail: 'forms@first-pharma.example',
      attachmentRows: [
        {
          row: {
            Supplier: 'Second Pharma Ltd',
            Email: 'contact@second-pharma.example',
          },
        },
      ],
    });

    assert.equal(result.supplierNameCandidate, null);
    assert.ok(
      result.conflicts.some((conflict) =>
        conflict.includes('conflicting supplier name'),
      ),
    );
  });

  it('does not silently overwrite a different approved contact', () => {
    const result = extractSupplierContact({
      fromEmail: 'new@delta-pharma.eu',
      supplierMappings: [
        { pattern: '@delta-pharma.eu', supplierName: 'Delta Pharma' },
      ],
      previouslyApprovedContact: {
        contactEmail: 'approved@delta-pharma.eu',
        normalizedSupplierName: 'delta pharma',
      },
    });

    assert.ok(
      result.conflicts.some((conflict) =>
        conflict.includes('previously approved contact'),
      ),
    );
    assert.equal(result.status, 'STAGED');
  });
});
