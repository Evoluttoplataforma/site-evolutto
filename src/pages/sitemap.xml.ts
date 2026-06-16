import type { APIContext } from 'astro';

const PATHS = [
  { p: '/', pr: '1.0' },
  { p: '/plataforma', pr: '0.9' },
  { p: '/consultoria', pr: '0.9' },
  { p: '/mentorias', pr: '0.8' },
  { p: '/do-zero-a-escala', pr: '0.9' },
  { p: '/bootcamp', pr: '0.8' },
  { p: '/quem-somos', pr: '0.7' },
  { p: '/carreiras', pr: '0.5' },
  { p: '/indicacao', pr: '0.6' },
  { p: '/suporte', pr: '0.5' },
];

export async function GET(context: APIContext) {
  const base = (context.site ?? new URL('https://www.evolutto.com')).toString().replace(/\/$/, '');
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    PATHS.map((u) => `  <url><loc>${base}${u.p}</loc><changefreq>weekly</changefreq><priority>${u.pr}</priority></url>`).join('\n') +
    `\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
