#!/usr/bin/env node
/** Split batch SQL into per-article statement files + manifest for apply_migration. */
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join('scripts', 'seo-batches');
const out = path.join(dir, 'stmts');
fs.mkdirSync(out, { recursive: true });

const batchFiles = fs
  .readdirSync(dir)
  .filter((f) => /^batch-\d+\.sql$/.test(f))
  .sort();

let idx = 0;
const manifest = [];

for (const batchFile of batchFiles) {
  const sql = fs.readFileSync(path.join(dir, batchFile), 'utf8');
  const parts = sql.split(/(?=UPDATE evolutto_articles SET)/).filter(Boolean);
  for (const part of parts) {
    idx++;
    const slug =
      part.match(/WHERE slug = \$b\$([^$]+)\$b\$;?\s*$/m)?.[1] ||
      part.match(/WHERE slug = \$b\$([^$]+)/)?.[1] ||
      `unknown-${idx}`;
    const safe = slug.slice(0, 36).replace(/[^a-z0-9-]+/g, '-');
    const name = `seo_art_${String(idx).padStart(3, '0')}_${safe}`;
    const file = path.join(out, `${String(idx).padStart(3, '0')}-${safe}.sql`);
    fs.writeFileSync(file, part.trim() + '\n');
    manifest.push({ idx, slug, name, file, bytes: part.length, batch: batchFile });
  }
}

fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ statements: manifest.length, totalBytes: manifest.reduce((s, m) => s + m.bytes, 0) }, null, 2));
