#!/usr/bin/env node
/**
 * Aplica todos os batches SEO no Supabase via CLI (requer `npx supabase link`).
 * Uso: node scripts/run-seo-batches.mjs
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join('scripts', 'seo-batches');
const batches = fs
  .readdirSync(dir)
  .filter((f) => /^batch-\d+\.sql$/.test(f))
  .sort();

if (!batches.length) {
  console.error('Nenhum batch encontrado. Rode: node scripts/seo-optimize-all.mjs');
  process.exit(1);
}

for (const file of batches) {
  const full = path.join(dir, file);
  console.log(`Applying ${file}...`);
  execSync(`npx supabase@latest db query --linked -f "${full}"`, {
    stdio: 'inherit',
  });
}

console.log('Done. Rode: node scripts/seo-audit.mjs');
