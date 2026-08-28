#!/usr/bin/env node
/**
 * Auditoria rápida de SEO on-page dos artigos publicados (Supabase).
 * Uso: node scripts/seo-audit.mjs [--slug meu-artigo]
 */
const SUPA_URL = process.env.PUBLIC_SUPABASE_URL || 'https://yfpdrckyuxltvznqfqgh.supabase.co';
const ANON = process.env.PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmcGRyY2t5dXhsdHZ6bnFmcWdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTYwMDYsImV4cCI6MjA5MDAzMjAwNn0.PVMRz04lvMLepjv0ZCsr5mJ8K_Ux1fQlQgX1vOd4O2g';

const slugArg = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1];

const res = await fetch(`${SUPA_URL}/rest/v1/evolutto_articles?status=eq.published&select=slug,title,seo_title,seo_description,description,tldr,faq,keywords`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
});
if (!res.ok) throw new Error(await res.text());
const rows = await res.json();

const issues = [];
for (const r of rows) {
  if (slugArg && r.slug !== slugArg) continue;
  const meta = r.seo_description || r.description || '';
  const faqLen = Array.isArray(r.faq) ? r.faq.length : 0;
  const kwLen = Array.isArray(r.keywords) ? r.keywords.length : 0;
  const problems = [];
  if (!r.seo_title?.trim()) problems.push('sem seo_title');
  if (meta.length < 120) problems.push(`meta curta (${meta.length})`);
  if (meta.length > 165) problems.push(`meta longa (${meta.length})`);
  if (!r.tldr?.trim()) problems.push('sem tldr');
  if (faqLen < 3) problems.push(`faq ${faqLen}`);
  if (kwLen < 2) problems.push(`keywords ${kwLen}`);
  if (problems.length) issues.push({ slug: r.slug, title: r.title, problems });
}

issues.sort((a, b) => a.problems.length - b.problems.length);
console.log(`Artigos auditados: ${slugArg ? 1 : rows.length}`);
console.log(`Com pendências: ${issues.length}`);
for (const i of issues.slice(0, 40)) {
  console.log(`- ${i.slug}: ${i.problems.join(', ')}`);
}
if (issues.length > 40) console.log(`… +${issues.length - 40} artigos`);
process.exit(issues.length ? 1 : 0);
