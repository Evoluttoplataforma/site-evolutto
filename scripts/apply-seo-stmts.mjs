#!/usr/bin/env node
/** Export one statement as JSON for apply_migration. Usage: node scripts/apply-seo-stmts.mjs <1-based-index> */
import fs from 'node:fs';
import path from 'node:path';

const idx = parseInt(process.argv[2], 10);
if (!idx) {
  console.error('Usage: node scripts/apply-seo-stmts.mjs <index>');
  process.exit(1);
}

const manifest = JSON.parse(
  fs.readFileSync(path.join('scripts', 'seo-batches', 'stmts', 'manifest.json'), 'utf8'),
);
const item = manifest[idx - 1];
if (!item) {
  console.error(`Index ${idx} not found (${manifest.length} statements)`);
  process.exit(1);
}

const query = fs.readFileSync(item.file, 'utf8');
console.log(JSON.stringify({ name: item.name, slug: item.slug, query, bytes: item.bytes }));
