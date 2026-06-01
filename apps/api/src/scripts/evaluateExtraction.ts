import { runExtractionEval } from '../extractionEval/harness';

function formatBool(value: boolean): string {
  return value ? 'yes' : 'no';
}

function printSummary(summary: Awaited<ReturnType<typeof runExtractionEval>>) {
  console.log('Extraction evaluation');
  console.log('=====================');
  console.log(`Total cases: ${summary.totalCases}`);
  console.log(`Passed cases: ${summary.passedCases}`);
  console.log(`Failed cases: ${summary.failedCases}`);
  console.log(`Extracted offers: ${summary.extractedOffersCount}`);
  console.log(`False positives: ${summary.falsePositives}`);
  console.log(`False negatives: ${summary.falseNegatives}`);
  console.log(`Review-required cases: ${summary.reviewRequiredCount}`);
  console.log(`Auto-promotion eligible cases: ${summary.autoPromotionCount}`);
  console.log('');

  console.log('Case results');
  console.log('------------');
  for (const result of summary.caseResults) {
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(
      `${status} ${result.id}: ${result.extractedOfferCount}/${result.expectedOfferCount} offer(s), review=${formatBool(result.reviewRequired)}, auto-promotion-eligible=${formatBool(result.autoPromotionEligible)}`,
    );
    if (result.parsingSources.length > 0) {
      console.log(`  Parsing: ${result.parsingSources.join(', ')}`);
    }
    if (result.documentClass) {
      console.log(`  Document class: ${result.documentClass}`);
    }
    for (const offer of result.extractedOffers) {
      console.log(
        `  Offer: ${offer.productText} | ${offer.price} ${offer.currencyCode ?? ''} | ${offer.confidence} | ${offer.sourceLabel}`.trim(),
      );
    }
    for (const mismatch of result.mismatches) {
      console.log(`  Mismatch: ${mismatch}`);
    }
  }

  console.log('');
  console.log('Recommended pilot thresholds (not enforced yet)');
  console.log('------------------------------------------------');
  console.log('- false positives: 0 on sanitized regression fixtures');
  console.log('- false negatives: 0 on clear supplier offer fixtures');
  console.log(
    '- AI fallback cases: always review-required unless explicitly approved later',
  );
  console.log(
    '- review-required count: expected to be non-zero for ambiguous or incomplete cases',
  );
}

async function main() {
  const fixturePath = process.argv[2];
  const summary = await runExtractionEval(fixturePath);
  printSummary(summary);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Extraction evaluation failed.',
  );
  process.exitCode = 1;
});
