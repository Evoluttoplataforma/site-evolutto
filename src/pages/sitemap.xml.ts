import type { APIContext } from 'astro';
import { allPosts, categoriesOf } from '../lib/blog';

const PAGES = [
  { p: '/', pr: '1.0' },
  { p: '/erp-software', pr: '0.9' },
  { p: '/consultoria', pr: '0.9' },
  { p: '/mentorias', pr: '0.8' },
  { p: '/do-zero-a-escala', pr: '0.9' },
  { p: '/bootcamp', pr: '0.8' },
  { p: '/quem-somos', pr: '0.7' },
  { p: '/carreiras', pr: '0.5' },
  { p: '/indicacao', pr: '0.6' },
  { p: '/suporte', pr: '0.5' },
  { p: '/politica-de-privacidade', pr: '0.3' },
  { p: '/blog', pr: '0.9' },
  { p: '/blog/artigos', pr: '0.6' },
];

export async function GET(context: APIContext) {
  const base = (context.site ?? new URL('https://www.evolutto.com')).toString().replace(/\/$/, '');
  const posts = await allPosts();
  const cats = categoriesOf(posts);
  const totalPages = Math.ceil(posts.length / 12);

  const urls: { loc: string; pr?: string; lastmod?: string }[] = [
    ...PAGES.map((u) => ({ loc: `${base}${u.p}`, pr: u.pr })),
    ...Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => ({ loc: `${base}/blog/artigos/${i + 2}` })),
    ...cats.map((c) => ({ loc: `${base}/blog/categoria/${c.slug}` })),
    ...posts.map((p) => ({ loc: `${base}/blog/${p.slug}`, lastmod: (p.data.updatedDate ?? p.data.pubDate).toISOString().slice(0, 10) })),
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map((u) => `  <url><loc>${u.loc}</loc>${u.pr ? `<priority>${u.pr}</priority>` : ''}${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
      .join('\n') +
    `\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
