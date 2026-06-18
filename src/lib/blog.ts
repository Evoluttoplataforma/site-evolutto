import { marked } from 'marked';

// ===== Fonte de dados: Supabase (tabela evolutto_articles) =====
// A anon key é pública; a policy RLS só expõe artigos com status = 'published'.
const SUPA_URL = import.meta.env.PUBLIC_SUPABASE_URL || 'https://yfpdrckyuxltvznqfqgh.supabase.co';
const ANON =
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmcGRyY2t5dXhsdHZ6bnFmcWdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTYwMDYsImV4cCI6MjA5MDAzMjAwNn0.PVMRz04lvMLepjv0ZCsr5mJ8K_Ux1fQlQgX1vOd4O2g';

export interface PostData {
  title: string;
  description: string;
  pubDate: Date;
  category: string;
  author: string;
  cover?: string;
  draft: boolean;
  seoTitle?: string;
  seoDescription?: string;
  keywords?: string[];
  tldr?: string;
  updatedDate?: Date;
  ogImage?: string;
  faq?: { pergunta: string; resposta: string }[];
}

export interface Post {
  id: string;
  slug: string;
  body: string; // conteúdo cru (markdown OU html) — use renderBody() para exibir
  data: PostData;
}

export const catSlug = (c: string) =>
  c
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// Renderiza o corpo para HTML.
// Os posts importados são HTML "solto" (headings/imgs em HTML + parágrafos como texto puro).
// O marked passa o HTML adiante e embrulha os parágrafos soltos em <p>, normalizando tudo.
// Também remove um <h1> inicial duplicado (o título já aparece no cabeçalho do post).
export function renderBody(body: string): string {
  let b = (body || '').trim();
  if (!b) return '';
  b = b.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '');
  return marked.parse(b, { gfm: true, breaks: false, async: false }) as string;
}

function rowToPost(r: any): Post {
  return {
    id: r.id,
    slug: r.slug,
    body: r.body || '',
    data: {
      title: r.title || r.slug,
      description: r.description || r.seo_description || '',
      pubDate: new Date(`${r.pub_date || r.created_at || '2020-01-01'}T00:00:00`),
      category: r.category || 'Geral',
      author: r.author || 'Equipe Evolutto',
      cover: r.cover || undefined,
      draft: r.status !== 'published',
      seoTitle: r.seo_title || undefined,
      seoDescription: r.seo_description || undefined,
      keywords: Array.isArray(r.keywords) && r.keywords.length ? r.keywords : undefined,
      tldr: r.tldr || undefined,
      updatedDate: r.updated_date ? new Date(`${r.updated_date}T00:00:00`) : undefined,
      ogImage: r.og_image || undefined,
      faq: Array.isArray(r.faq) && r.faq.length ? r.faq : undefined,
    },
  };
}

let _cache: Promise<Post[]> | null = null;

async function fetchPosts(): Promise<Post[]> {
  const res = await fetch(`${SUPA_URL}/rest/v1/evolutto_articles?status=eq.published&select=*`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = (await res.json()) as any[];
  return rows.map(rowToPost);
}

export async function allPosts(): Promise<Post[]> {
  if (!_cache) _cache = fetchPosts();
  const posts = await _cache;
  return [...posts].sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
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
