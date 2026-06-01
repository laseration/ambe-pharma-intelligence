import fs from 'node:fs';
import path from 'node:path';

type ReplayOptions = {
  apiBaseUrl: string;
  fixturePath: string;
};

function readOptions(): ReplayOptions {
  const fixtureArg = process.argv[2];

  if (!fixtureArg) {
    throw new Error(
      'Usage: tsx scripts/replay-telegram-fixture.ts <fixture-path> [api-base-url]',
    );
  }

  return {
    fixturePath: path.resolve(process.cwd(), fixtureArg),
    apiBaseUrl: process.argv[3] || 'http://localhost:4000',
  };
}

async function main() {
  const options = readOptions();
  const payload = JSON.parse(fs.readFileSync(options.fixturePath, 'utf8'));

  const response = await fetch(
    `${options.apiBaseUrl}/api/telegram/inbound/updates`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  const body = await response.text();

  console.log(`POST ${options.apiBaseUrl}/api/telegram/inbound/updates`);
  console.log(`Fixture: ${options.fixturePath}`);
  console.log(`Status: ${response.status}`);
  console.log(body);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Fixture replay failed.',
  );
  process.exit(1);
});
