import { runExtractionEval } from '../extractionEval/harness';
import { formatExtractionEvalReport } from '../extractionEval/report';

async function main() {
  const args = process.argv.slice(2);
  const allowLiveAi =
    process.env.AMBE_EXTRACTION_EVAL_LIVE_AI === '1' ||
    args.includes('--live-ai');
  const fixturePath = args.find((arg) => !arg.startsWith('--'));
  const summary = await runExtractionEval({
    fixturePath,
    allowLiveAi,
  });

  console.log(formatExtractionEvalReport(summary, { allowLiveAi }));

  if (summary.failedCases > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Extraction evaluation failed.',
  );
  process.exitCode = 1;
});
