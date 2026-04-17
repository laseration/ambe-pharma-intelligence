import path from 'node:path';

import dotenv from 'dotenv';

const apiRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(apiRoot, '../..');

dotenv.config({ path: path.join(apiRoot, '.env'), override: false });
dotenv.config({ path: path.join(repoRoot, '.env'), override: false });

type NodeEnv = 'development' | 'test' | 'production';

function readString(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function readPort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function readNodeEnv(value: string | undefined): NodeEnv {
  if (value === 'test' || value === 'production') {
    return value;
  }

  return 'development';
}

function readDatabaseHost(value: string | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).host;
  } catch {
    return null;
  }
}

export const env = {
  nodeEnv: readNodeEnv(process.env.NODE_ENV),
  port: readPort(process.env.PORT, 4000),
  logLevel: readString(process.env.LOG_LEVEL, 'info'),
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  databaseHost: readDatabaseHost(process.env.DATABASE_URL),
};
