import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { defineConfig } from 'prisma/config';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const primaryEnvPath = path.resolve(process.cwd(), '.env');
const fallbackEnvPath = path.resolve(process.cwd(), '../../.env');

const primaryEnvExists = fs.existsSync(primaryEnvPath);
const fallbackEnvExists = fs.existsSync(fallbackEnvPath);

console.log('Prisma primary env path:', primaryEnvPath);
console.log('Prisma primary env exists:', primaryEnvExists);
console.log('Prisma fallback env path:', fallbackEnvPath);
console.log('Prisma fallback env exists:', fallbackEnvExists);

if (primaryEnvExists) {
  dotenv.config({ path: primaryEnvPath });
}

if (!process.env.DATABASE_URL?.trim() && fallbackEnvExists) {
  dotenv.config({ path: fallbackEnvPath });
}

console.log(
  'DATABASE_URL detected:',
  Boolean(process.env.DATABASE_URL?.trim()),
);

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL is missing in Prisma config');
  process.exit(1);
}

const host = process.env.DATABASE_URL.split('@')[1]?.split('/')[0] ?? 'unknown';
console.log('Prisma using DB host:', host);

export default defineConfig({
  schema: path.join(currentDir, 'prisma/schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
