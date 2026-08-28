#!/usr/bin/env node
/**
 * Otimização SEO/GEO em lote — artigos Evolutto (Supabase).
 * Gera SQL em scripts/seo-batches/ para apply_migration.
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPA_URL = process.env.PUBLIC_SUPABASE_URL || 'https://yfpdrckyuxltvznqfqgh.supabase.co';
const ANON = process.env.PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmcGRyY2t5dXhsdHZ6bnFmcWdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTYwMDYsImV4cCI6MjA5MDAzMjAwNn0.PVMRz04lvMLepjv0ZCsr5mJ8K_Ux1fQlQgX1vOd4O2g';

const SITE_LINKS = [
  { href: '/erp-software', phrases: ['plataforma Evolutto', 'software para consultoria', 'plataforma para consultoria', 'plataforma all-in-one'] },
  { href: '/consultoria', phrases: ['consultoria digital', 'digitalizar sua consultoria', 'escalar consultoria'] },
  { href: '/do-zero-a-escala', phrases: ['Do Zero a Escala', 'curso para consultores'] },
  { href: '/bootcamp', phrases: ['Bootcamp da Virada', 'bootcamp'] },
  { href: '/mentorias', phrases: ['programas de mentoria', 'mentorias'] },
];

const OUT_DIR = path.join('scripts', 'seo-batches');
const BATCH_SIZE = 12;

function trimWords(s, max) {
  if (s.length <= max) return s.trim();
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > 20 ? cut.slice(0, sp) : cut).trim();
}

function escapeSqlDollar(s) {
  if (!s.includes('$b$')) return `$b$${s}$b$`;
  let tag = '$b$';
  let n = 0;
  while (s.includes(`${tag}$`)) tag = `$b${++n}$`;
  return `${tag}${s}${tag}`;
}

function countLinks(body) {
  return (body.match(/href="\/[^"]+"/g) || []).length;
}

function hasHref(body, href) {
  return body.includes(`href="${href}"`) || body.includes(`href='${href}'`);
}

function wrapPhrase(body, phrase, href) {
  if (hasHref(body, href)) return body;
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = body.split(/(<a\b[\s\S]*?<\/a>)/gi);
  let done = false;
  return parts
    .map((part) => {
      if (done || /^<a\b/i.test(part)) return part;
      const re = new RegExp(`(${esc})`, 'i');
      if (re.test(part)) {
        done = true;
        return part.replace(re, `<a href="${href}">$1</a>`);
      }
      return part;
    })
    .join('');
}

function keywordOverlap(a, b) {
  const setA = new Set((a.keywords || []).map((k) => k.toLowerCase()));
  let score = 0;
  for (const k of b.keywords || []) {
    if (setA.has(k.toLowerCase())) score += 2;
  }
  if (a.category === b.category) score += 1;
  return score;
}

function relatedPosts(article, all, limit = 4) {
  return all
    .filter((x) => x.slug !== article.slug)
    .map((x) => ({ slug: x.slug, score: keywordOverlap(article, x), kw: x.keywords?.[0], title: x.title }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function optimizeSeoTitle(article) {
  const kw = (article.keywords?.[0] || '').trim();
  let title = (article.seo_title || article.title || '').replace(/\s+/g, ' ').trim();

  if (kw && title.length > 60) {
    const benefit = article.title.includes(':')
      ? article.title.split(':').slice(1).join(':').trim()
      : article.title.replace(new RegExp(kw, 'i'), '').replace(/^[\s:\-–]+/, '').trim();
    const candidate = benefit ? `${kw}: ${benefit}` : kw;
    title = trimWords(candidate, 60);
  }

  if (title.length > 60) title = trimWords(title, 57) + '…';

  if (kw && !title.toLowerCase().startsWith(kw.toLowerCase().slice(0, Math.min(10, kw.length)))) {
    const short = trimWords(kw, 38);
    const tail = article.title.includes(':') ? article.title.split(':').pop().trim() : trimWords(article.title, 25);
    const alt = trimWords(`${short}: ${tail}`, 60);
    if (alt.length >= 30 && alt.length <= 60) title = alt;
  }

  return title.slice(0, 60);
}

function expandFaq(article) {
  const faq = Array.isArray(article.faq) ? [...article.faq] : [];
  if (faq.length >= 4) return faq;

  const kw = article.keywords?.[0] || article.category || 'consultoria';
  const pool = [
    {
      pergunta: `O que é ${kw} na prática para consultores?`,
      resposta: article.tldr || article.description || '',
    },
    {
      pergunta: 'Por onde começar a aplicar isso na minha consultoria?',
      resposta: `Comece pelo diagnóstico do modelo atual, padronize o método de entrega e use tecnologia para escalar sem depender só de horas — como descrito ao longo deste artigo.`,
    },
    {
      pergunta: 'Como a plataforma Evolutto se relaciona com este tema?',
      resposta: `A Evolutto ajuda a organizar projetos, comunicação e entregas em um só lugar — ideal para consultores que querem ${kw} com previsibilidade e escala.`,
    },
  ].filter((x) => x.resposta && x.resposta.length >= 40);

  for (const item of pool) {
    if (faq.length >= 4) break;
    if (!faq.some((f) => f.pergunta === item.pergunta)) faq.push(item);
  }
  return faq.slice(0, 6);
}

function fixLegacyBlogLinks(body) {
  return (body || '')
    .replace(/origin=https:%2F%2Fblog\.evolutto\.com/g, 'origin=https:%2F%2Fwww.evolutto.com')
    .replace(/https:\/\/blog\.evolutto\.com/g, 'https://www.evolutto.com/blog');
}

function addInternalLinks(article, all) {
  let body = fixLegacyBlogLinks(article.body || '');
  const target = Math.min(6, Math.max(3, 4));
  if (countLinks(body) >= target) return body;

  for (const site of SITE_LINKS) {
    if (countLinks(body) >= target) break;
    for (const phrase of site.phrases) {
      if (countLinks(body) >= target) break;
      if (body.toLowerCase().includes(phrase.toLowerCase())) {
        body = wrapPhrase(body, phrase, site.href);
      }
    }
  }

  const related = relatedPosts(article, all, 5);
  for (const r of related) {
    if (countLinks(body) >= target) break;
    const href = `/blog/${r.slug}`;
    if (hasHref(body, href)) continue;
    const anchors = [r.kw, ...r.title.split(/[\s:–-]+/).filter((w) => w.length > 5)].slice(0, 4);
    for (const a of anchors) {
      if (!a || a.length < 6) continue;
      if (body.toLowerCase().includes(a.toLowerCase())) {
        body = wrapPhrase(body, a, href);
        if (hasHref(body, href)) break;
      }
    }
  }

  return body;
}

function sqlUpdate(article, changes) {
  const sets = [];
  if (changes.seo_title) sets.push(`seo_title = ${escapeSqlDollar(changes.seo_title)}`);
  if (changes.body) sets.push(`body = ${escapeSqlDollar(changes.body)}`);
  if (changes.faq) sets.push(`faq = ${escapeSqlDollar(JSON.stringify(changes.faq))}::jsonb`);
  sets.push('updated_at = now()');
  return `UPDATE evolutto_articles SET ${sets.join(', ')} WHERE slug = ${escapeSqlDollar(article.slug)};`;
}

const res = await fetch(
  `${SUPA_URL}/rest/v1/evolutto_articles?status=eq.published&select=slug,title,description,seo_title,seo_description,body,tldr,faq,keywords,category`,
  { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } },
);
if (!res.ok) throw new Error(await res.text());
const articles = await res.json();

fs.mkdirSync(OUT_DIR, { recursive: true });

const stats = { titles: 0, links: 0, faq: 0, unchanged: 0 };
const sqlLines = [];

for (const a of articles) {
  const newTitle = optimizeSeoTitle(a);
  const newBody = addInternalLinks(a, articles);
  const newFaq = expandFaq(a);

  const changes = {};
  if (newTitle !== (a.seo_title || '').trim()) {
    changes.seo_title = newTitle;
    stats.titles++;
  }
  if (newBody !== a.body) {
    changes.body = newBody;
    stats.links++;
  }
  if (JSON.stringify(newFaq) !== JSON.stringify(a.faq || [])) {
    changes.faq = newFaq;
    stats.faq++;
  }

  if (Object.keys(changes).length === 0) {
    stats.unchanged++;
    continue;
  }
  sqlLines.push(sqlUpdate(a, changes));
}

const batches = [];
for (let i = 0; i < sqlLines.length; i += BATCH_SIZE) {
  batches.push(sqlLines.slice(i, i + BATCH_SIZE));
}

batches.forEach((lines, i) => {
  const file = path.join(OUT_DIR, `batch-${String(i + 1).padStart(2, '0')}.sql`);
  fs.writeFileSync(file, lines.join('\n\n') + '\n');
});

fs.writeFileSync(
  path.join(OUT_DIR, 'summary.json'),
  JSON.stringify({ total: articles.length, batches: batches.length, stats }, null, 2),
);

console.log(JSON.stringify({ total: articles.length, batches: batches.length, stats }, null, 2));
