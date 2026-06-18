#!/usr/bin/env node

/**
 * Generates prisma/schema-mysql.prisma from prisma/schema.prisma.
 *
 * Transformations:
 *  1. provider "postgresql" → "mysql"
 *  2. @db.Timestamp()       → @db.Timestamp(0)
 *  3. @db.Json              → (removed — MySQL Json needs no annotation)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, '..', 'prisma', 'schema.prisma');
const dest = resolve(__dirname, '..', 'prisma', 'schema-mysql.prisma');

const content = readFileSync(src, 'utf8')
  .replace('provider = "postgresql"', 'provider = "mysql"')
  .replace(/@db\.Timestamp\(\)/g, '@db.Timestamp(0)')
  .replace(/ +@db\.Json/g, '');

const header =
  '// AUTO-GENERATED from schema.prisma — do not edit manually.\n' +
  '// Run: npm run prisma:schema:mysql\n\n';

writeFileSync(dest, header + content, 'utf8');
console.log('✔ Generated prisma/schema-mysql.prisma');
