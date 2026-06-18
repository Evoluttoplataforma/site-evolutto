import type { APIRoute } from 'astro';
import { allPosts, catSlug } from '../../lib/blog';

export const GET: APIRoute = async () => {
  const posts = await allPosts();
  const data = posts.map((p) => ({
    title: p.data.title,
    description: p.data.description,
    category: p.data.category,
    categorySlug: catSlug(p.data.category),
    date: p.data.pubDate.toISOString().slice(0, 10),
    url: `/blog/${p.slug}`,
  }));
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
};
