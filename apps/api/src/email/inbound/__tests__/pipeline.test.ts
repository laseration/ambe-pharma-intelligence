import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAiOfferCandidates, decomposeEmail, extractLooseOfferCandidate } from '../pipeline';

test('decomposeEmail splits forwarded and signature segments', async () => {
  const segments = await decomposeEmail({
    from: 'sandeep@ambemedical.com',
    subject: 'Fwd: supplier quote',
    bodyText: [
      'Please see below.',
      '',
      'From: pricing@supplier.co',
      'Sent: Monday, 21 April 2026 10:00',
      'Subject: Offer',
      '',
      'Paracetamol 500mg caplets 16 - GBP 1.25',
      '',
      'Kind regards,',
      'Supplier Co Ltd',
    ].join('\n'),
  });

  assert.equal(segments.some((segment) => segment.kind === 'SUBJECT'), true);
  assert.equal(segments.some((segment) => segment.kind === 'BODY_MAIN'), true);
  assert.equal(segments.some((segment) => segment.kind === 'BODY_FORWARDED'), true);
});

test('decomposeEmail includes extracted attachment text for PDF and image attachments', async () => {
  const segments = await decomposeEmail(
    {
      from: 'pricing@supplier.co',
      subject: 'Quote attached',
      attachments: [
        {
          fileName: 'quote.pdf',
          mimeType: 'application/pdf',
          content: Buffer.from('fake-pdf').toString('base64'),
        },
        {
          fileName: 'offer.jpg',
          mimeType: 'image/jpeg',
          content: Buffer.from('fake-image').toString('base64'),
        },
      ],
    },
    {
      extractAttachmentText: async (attachment) =>
        attachment.fileName === 'quote.pdf'
          ? {
              method: 'PDF_TEXT',
              text: 'Amlodipine 5mg tabs 28 - 8.40 GBP',
              warnings: [],
            }
          : attachment.fileName === 'offer.jpg'
            ? {
                method: 'IMAGE_OCR',
                text: 'Paracetamol 500mg caplets 16 - 1.25 GBP',
                warnings: [],
              }
            : null,
    },
  );

  const attachmentTextSegments = segments.filter((segment) => segment.kind === 'ATTACHMENT_TEXT');

  assert.equal(attachmentTextSegments.length, 2);
  assert.equal(attachmentTextSegments[0]?.label, 'quote.pdf');
  assert.equal(attachmentTextSegments[1]?.label, 'offer.jpg');
});

test('decomposeEmail ignores inline image attachments when a spreadsheet attachment is present', async () => {
  const segments = await decomposeEmail(
    {
      from: 'pricing@supplier.co',
      subject: 'Quote attached',
      attachments: [
        {
          fileName: 'image002.png',
          mimeType: 'image/png',
          disposition: 'inline',
          contentId: 'cid-image',
          content: Buffer.from('fake-image').toString('base64'),
        },
        {
          fileName: 'price-list.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          disposition: 'attachment',
          content: Buffer.from('fake-xlsx').toString('base64'),
        },
      ],
    },
    {
      extractAttachmentText: async () => ({
        method: 'IMAGE_OCR',
        text: 'This inline image should not be parsed',
        warnings: [],
      }),
    },
  );

  assert.equal(segments.some((segment) => segment.label === 'image002.png'), false);
});

test('extractLooseOfferCandidate captures explicit manufacturer, moq, and availability', () => {
  const candidate = extractLooseOfferCandidate(
    'Available: Amlodipine 5mg tablets 28 by Teva at GBP 8.40 MOQ 20 limited stock',
    0,
    'BLOCK_BODY_MAIN',
    70,
  );

  assert.ok(candidate);
  assert.equal(candidate?.rawProductText?.includes('Amlodipine 5mg tablets 28'), true);
  assert.equal(candidate?.manufacturerCandidate, 'Teva');
  assert.equal(candidate?.currencyCandidate, 'GBP');
  assert.equal(candidate?.minimumOrderQuantityCandidate, 20);
  assert.equal(candidate?.availabilityCandidate?.toLowerCase().includes('available'), true);
});

test('buildAiOfferCandidates preserves extracted AI fields and segment linkage', () => {
  const candidates = buildAiOfferCandidates(
    {
      totalLines: 1,
      candidateLines: 1,
      parsedRows: [
        {
          lineNumber: 1,
          rawLine: 'Paracetamol 500mg caplets 16 at 1.25 GBP, MOQ 20. Limited stock.',
          evidenceText: 'Paracetamol 500mg caplets 16 at 1.25 GBP, MOQ 20. Limited stock.',
          rawProductName: 'Paracetamol 500mg caplets 16',
          rawProductText: 'Paracetamol 500mg caplets 16',
          strength: '500mg',
          formulation: 'caplet',
          packSize: '16',
          price: 1.25,
          currencyCode: 'GBP',
          availability: 'Limited stock',
          minimumOrderQuantity: 20,
          manufacturer: 'Acme',
          sourceSegment: 'BODY_FORWARDED',
          productCandidates: {
            baseName: 'paracetamol',
            normalizedName: 'paracetamol',
            strength: '500mg',
            formulation: 'caplet',
            packSize: '16',
            normalizedKey: 'paracetamol|500mg|caplet|16',
            confidence: 'HIGH',
            explanation: {
              cleanedInput: 'paracetamol 500mg caplets 16',
              tokens: ['paracetamol', '500', 'mg', 'caplet', '16'],
              rulesApplied: [],
              extracted: {
                strength: '500mg',
                formulation: 'caplet',
                packSize: '16',
              },
            },
          },
          confidence: 'MEDIUM',
          explanation: 'Explicit commercial facts in messy prose.',
        },
      ],
      skippedLines: [],
      overallConfidence: 'MEDIUM',
      reviewRecommended: true,
      reviewRequired: true,
      rawBodyText: 'Paracetamol 500mg caplets 16 at 1.25 GBP, MOQ 20. Limited stock.',
      rawBody: 'Paracetamol 500mg caplets 16 at 1.25 GBP, MOQ 20. Limited stock.',
      parsingSource: 'OPENAI_FALLBACK',
      aiFallbackAttempted: true,
      aiFallbackUsed: true,
      aiFallbackDecision: 'accepted',
      supplierName: 'Acme Pharma Ltd',
    },
    {
      bodyMain: 4,
      bodyForwarded: 9,
      signature: 12,
    },
    70,
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.manufacturerCandidate, 'Acme');
  assert.equal(candidates[0]?.minimumOrderQuantityCandidate, 20);
  assert.equal(candidates[0]?.availabilityCandidate, 'Limited stock');
  assert.equal(candidates[0]?.supplierCandidate, 'Acme Pharma Ltd');
  assert.equal(candidates[0]?.sourceDocumentIndex, 9);
  assert.equal(
    candidates[0]?.evidences.some((evidence) => evidence.fieldName === 'manufacturerCandidate'),
    true,
  );
  assert.equal(
    candidates[0]?.evidences.some((evidence) => evidence.fieldName === 'minimumOrderQuantityCandidate'),
    true,
  );
});
