import type { ExtractionEvalSummary } from './harness';

function formatBool(value: boolean): string {
  return value ? 'yes' : 'no';
}

function formatFieldCounts(
  counts: ExtractionEvalSummary['fieldMismatchCounts'],
): string {
  if (counts.length === 0) {
    return 'none';
  }

  return counts
    .map((item) => `${item.fieldName}=${item.count}`)
    .join(', ');
}

export function formatExtractionEvalReport(
  summary: ExtractionEvalSummary,
  options: { allowLiveAi?: boolean } = {},
): string {
  const lines: string[] = [];

  if (options.allowLiveAi) {
    lines.push(
      'Live AI evaluation mode is enabled. Results may be non-deterministic and should not be used as CI gates.',
      '',
    );
  }

  lines.push(
    'Extraction evaluation',
    '=====================',
    `Total cases: ${summary.totalCases}`,
    `Passed cases: ${summary.passedCases}`,
    `Failed cases: ${summary.failedCases}`,
    `Extracted offers: ${summary.extractedOffersCount}`,
    `False positives: ${summary.falsePositives}`,
    `False negatives: ${summary.falseNegatives}`,
    `Review-required cases: ${summary.reviewRequiredCount}`,
    `Auto-promotion eligible cases: ${summary.autoPromotionCount}`,
    `AI-used cases: ${summary.aiUsedCount}`,
    `Field mismatches: ${formatFieldCounts(summary.fieldMismatchCounts)}`,
    '',
    'Case results',
    '------------',
  );

  for (const result of summary.caseResults) {
    const status = result.passed ? 'PASS' : 'FAIL';
    lines.push(
      `${status} ${result.id}: ${result.extractedOfferCount}/${result.expectedOfferCount} offer(s), review=${formatBool(result.reviewRequired)}, auto-promotion-eligible=${formatBool(result.autoPromotionEligible)}`,
    );

    if (result.parsingSources.length > 0) {
      lines.push(`  Parsing: ${result.parsingSources.join(', ')}`);
    }

    if (result.documentClass) {
      lines.push(`  Document class: ${result.documentClass}`);
    }

    if (result.mismatchFields.length > 0) {
      lines.push(`  Mismatch fields: ${result.mismatchFields.join(', ')}`);
    }
  }

  lines.push(
    '',
    'Recommended pilot thresholds',
    '----------------------------',
    '- false positives: 0 on sanitized regression fixtures',
    '- false negatives: 0 on clear supplier offer fixtures',
    '- field mismatches: 0 for productText, price, currencyCode, strength, dosageForm, packSize, minimumOrderQuantity, and availability',
    '- AI fallback cases: always review-required unless explicitly approved later',
    '- review-required count: expected to be non-zero for ambiguous or incomplete cases',
  );

  return lines.join('\n');
}
