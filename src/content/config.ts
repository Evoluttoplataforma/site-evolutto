import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    category: z.string().default('Consultoria'),
    author: z.string().default('Equipe Evolutto'),
    cover: z.string().optional(),
    draft: z.boolean().default(false),

    // ===== SEO / AIO / GEO (Answer & Generative Engine Optimization) =====
    seoTitle: z.string().optional(), // title tag custom (senão usa title)
    seoDescription: z.string().optional(), // meta description (senão usa description)
    keywords: z.array(z.string()).optional(), // palavras-chave
    tldr: z.string().optional(), // "Resposta rápida" / resumo citável no topo
    updatedDate: z.coerce.date().optional(), // dateModified
    ogImage: z.string().optional(), // imagem de compartilhamento (senão usa cover)
    faq: z
      .array(z.object({ pergunta: z.string(), resposta: z.string() }))
      .optional(), // gera FAQPage schema + seção FAQ
  }),
});

export const collections = { posts };
