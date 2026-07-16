#!/usr/bin/env node

/**
 * Generates prisma-mysql/schema.prisma from prisma/schema.prisma.
 *
 * Transformations:
 *  1. provider "postgresql" → "mysql"
 *  2. generator client      → generator client (unique language-server identifier)
 *  3. @db.Timestamp()       → @db.Timestamp(0)
 *  4. @db.Json              → (removed — MySQL Json needs no annotation)
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, '..', 'prisma', 'schema.prisma');
const dest = resolve(__dirname, '..', 'prisma-mysql', 'schema.prisma');

const content = readFileSync(src, 'utf8')
  .replace('provider = "postgresql"', 'provider = "mysql"')
  .replace('generator client {', 'generator client {')
  .replace(/@db\.Timestamp\(\)/g, '@db.Timestamp(0)')
  .replace(/ +@db\.Json/g, '');

const header =
  '// AUTO-GENERATED from schema.prisma — do not edit manually.\n' +
  '// Run: npm run prisma:schema:mysql\n\n';

mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, header + content, 'utf8');
console.log('✔ Generated prisma-mysql/schema.prisma');
