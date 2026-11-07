import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.string(),
    category: z.enum(['moje-prace', 'motoryzacja', 'warsztat', 'hobby']),
    tags: z.array(z.string()),
    readingTime: z.string(),
    featured: z.boolean().optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    focusKeyword: z.string().optional(),
    canonicalUrl: z.string().optional(),
    ogImage: z.string().optional(),
    robots: z.string().optional(),
  }),
});

export const collections = { blog };
