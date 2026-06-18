import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

export const catSlug = (c: string) =>
  c
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export async function allPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function categoriesOf(posts: Post[]) {
  const map = new Map<string, number>();
  for (const p of posts) map.set(p.data.category, (map.get(p.data.category) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, count]) => ({ name, count, slug: catSlug(name) }))
    .sort((a, b) => b.count - a.count);
}

export const fmtDate = (d: Date) =>
  d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
