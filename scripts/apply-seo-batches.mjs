#!/usr/bin/env node
/**
 * Imprime cada batch SQL como JSON line para apply_migration externo.
 * Uso: node scripts/apply-seo-batches.mjs [batch-num]
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join('scripts', 'seo-batches');
const arg = process.argv[2];
const files = fs
  .readdirSync(dir)
  .filter((f) => /^batch-\d+\.sql$/.test(f))
  .sort();

const selected = arg
  ? files.filter((f) => f === `batch-${String(arg).padStart(2, '0')}.sql`)
  : files;

for (const file of selected) {
  const num = file.match(/\d+/)[0];
  const query = fs.readFileSync(path.join(dir, file), 'utf8');
  console.log(JSON.stringify({ name: `seo_optimize_batch_${num}`, query, bytes: query.length }));
}
