import assert from 'node:assert/strict';
import test from 'node:test';

import { inferEmailImportDecision } from '../helpers';

const baseInput = {
  senderEmail: 'sender@supplier.test',
  subject: 'Please see attached',
  fileName: null as string | null,
  fileType: 'XLSX' as const,
};

// --- Separator-blind filename matching (the core C1 fix) ---
// A correctly named price list used to fall into review when the subject was
// vague, because "price-list.xlsx" does not contain the substring "price list".

test('hyphenated price-list filename is imported even with a vague subject', () => {
  const decision = inferEmailImportDecision({
    ...baseInput,
    fileName: 'price-list.xlsx',
  });

  assert.equal(decision.processingStatus, 'RECEIVED');
  assert.equal(decision.inferredImportType, 'supplier-price-list');
  assert.equal(decision.confidence, 'HIGH');
});

test('underscore price_list filename is imported', () => {
  const decision = inferEmailImportDecision({
    ...baseInput,
    fileName: 'price_list.csv',
    fileType: 'CSV',
  });

  assert.equal(decision.processingStatus, 'RECEIVED');
  assert.equal(decision.inferredImportType, 'supplier-price-list');
});

test('joined pricelist filename is imported', () => {
  const decision = inferEmailImportDecision({
    ...baseInput,
    fileName: 'pricelist.xlsx',
  });

  assert.equal(decision.processingStatus, 'RECEIVED');
  assert.equal(decision.inferredImportType, 'supplier-price-list');
});

test('dotted multi-token filename still matches the price-list phrase', () => {
  const decision = inferEmailImportDecision({
    ...baseInput,
    fileName: 'april.2026.price.list.xlsx',
  });

  assert.equal(decision.processingStatus, 'RECEIVED');
  assert.equal(decision.inferredImportType, 'supplier-price-list');
});

// --- Dominant signal should not be blocked by one overlapping weak keyword ---

test('dominant price-list signal survives a single overlapping inventory keyword', () => {
  // "stock" nudges the inventory score, but the price-list signal clearly
  // dominates. Before C1 this went to review via the old mixed-signals rule.
  const decision = inferEmailImportDecision({
    senderEmail: 'sender@supplier.test',
    subject: 'Price list - stock available soon',
    fileName: 'prices.xlsx',
    fileType: 'XLSX',
  });

  assert.equal(decision.processingStatus, 'RECEIVED');
  assert.equal(decision.inferredImportType, 'supplier-price-list');
});

// --- Genuinely ambiguous input must still go to review (standards preserved) ---

test('genuinely competing price-list and inventory signals go to review', () => {
  const decision = inferEmailImportDecision({
    senderEmail: 'sender@supplier.test',
    subject: 'Price list and stock report',
    fileName: 'data.xlsx',
    fileType: 'XLSX',
  });

  assert.equal(decision.processingStatus, 'NEEDS_REVIEW');
  assert.equal(decision.inferredImportType, null);
});

test('vague subject with a non-descriptive filename still needs review', () => {
  const decision = inferEmailImportDecision({
    ...baseInput,
    fileName: 'data.xlsx',
  });

  assert.equal(decision.processingStatus, 'NEEDS_REVIEW');
  assert.equal(decision.inferredImportType, null);
});

// --- Other import types still resolve from descriptive filenames ---

test('inventory report filename resolves to the inventory import', () => {
  const decision = inferEmailImportDecision({
    senderEmail: 'sender@supplier.test',
    subject: 'Monthly stock report',
    fileName: 'inventory-report.csv',
    fileType: 'CSV',
  });

  assert.equal(decision.processingStatus, 'RECEIVED');
  assert.equal(decision.inferredImportType, 'inventory');
});

test('sales report filename resolves to the sales import', () => {
  const decision = inferEmailImportDecision({
    senderEmail: 'sender@supplier.test',
    subject: 'Sales report Q1',
    fileName: 'sales-report.xlsx',
    fileType: 'XLSX',
  });

  assert.equal(decision.processingStatus, 'RECEIVED');
  assert.equal(decision.inferredImportType, 'sales');
});

// --- Unchanged behaviour for non-importable attachment types ---

test('PDF attachments are routed to review', () => {
  const decision = inferEmailImportDecision({
    ...baseInput,
    fileName: 'price-list.pdf',
    fileType: 'PDF',
  });

  assert.equal(decision.processingStatus, 'REVIEW_REQUIRED');
  assert.equal(decision.inferredImportType, null);
});

test('unknown attachment types are routed to review', () => {
  const decision = inferEmailImportDecision({
    ...baseInput,
    fileName: 'notes.txt',
    fileType: 'UNKNOWN',
  });

  assert.equal(decision.processingStatus, 'NEEDS_REVIEW');
  assert.equal(decision.inferredImportType, null);
});
