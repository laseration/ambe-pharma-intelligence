import { readFile, writeFile } from 'node:fs/promises';

import {
  buildCorrectionEvalCandidateExport,
  type CorrectionEvalCandidateInputRecord,
} from '../extractionEval/candidateExport';
import { sanitizeSafeErrorMessage } from '../safety/redaction';

type CliArgs = {
  inputPath: string | null;
  outputPath: string | null;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    inputPath: null,
    outputPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') {
      args.inputPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === '--output') {
      args.outputPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
  }

  return args;
}

function usage(): string {
  return [
    'Usage:',
    '  pnpm --filter @ambe/api eval:correction-candidates -- --input <fake-demo-corrections.json> [--output <candidates.json>]',
    '',
    'Input must be a JSON array of fake/demo correction records or an object with a records array.',
    'The command never reads a database or live integration.',
  ].join('\n');
}

async function loadRecords(
  inputPath: string,
): Promise<CorrectionEvalCandidateInputRecord[]> {
  const raw = await readFile(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  const records = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { records?: unknown }).records)
      ? (parsed as { records: unknown[] }).records
      : null;

  if (!records) {
    throw new Error('Input JSON must be an array or an object with records[].');
  }

  return records as CorrectionEvalCandidateInputRecord[];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.inputPath) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const records = await loadRecords(args.inputPath);
  const exportPayload = buildCorrectionEvalCandidateExport(records);
  const serialized = `${JSON.stringify(exportPayload, null, 2)}\n`;

  if (args.outputPath) {
    await writeFile(args.outputPath, serialized, 'utf8');
    console.log(
      JSON.stringify(
        {
          status: 'written',
          outputPath: args.outputPath,
          candidateCount: exportPayload.candidates.length,
          skippedCount: exportPayload.skipped.length,
          sourceClassification: exportPayload.sourceClassification,
          requiresHumanSanitization: exportPayload.requiresHumanSanitization,
        },
        null,
        2,
      ),
    );
    return;
  }

  process.stdout.write(serialized);
}

main().catch((error: unknown) => {
  console.error(`FAIL: ${sanitizeSafeErrorMessage(error)}`);
  process.exitCode = 1;
});
