import path from 'node:path';
import { fileURLToPath } from 'node:url';

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

loadEnv({
  path: path.join(currentDir, '.env'),
  override: false,
});

loadEnv({
  path: path.join(currentDir, '../../.env'),
  override: false,
});

export default defineConfig({
  schema: path.join(currentDir, 'prisma/schema.prisma'),
});
