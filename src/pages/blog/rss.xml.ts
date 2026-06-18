import type { APIContext } from 'astro';
import { allPosts } from '../../lib/blog';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET(context: APIContext) {
  const base = (context.site ?? new URL('https://www.evolutto.com')).toString().replace(/\/$/, '');
  const posts = await allPosts();
  const items = posts
    .map(
      (p) =>
        `    <item><title>${esc(p.data.title)}</title><link>${base}/blog/${p.slug}/</link>` +
        `<guid>${base}/blog/${p.slug}/</guid><pubDate>${p.data.pubDate.toUTCString()}</pubDate>` +
        `<category>${esc(p.data.category)}</category><description>${esc(p.data.description)}</description></item>`
    )
    .join('\n');
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n` +
    `    <title>Blog Evolutto</title>\n    <link>${base}/blog/</link>\n` +
    `    <description>Consultoria digital, escala, produtização e gestão.</description>\n    <language>pt-BR</language>\n` +
    items +
    `\n  </channel>\n</rss>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
