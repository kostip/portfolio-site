import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    year: z.string(),
    role: z.string(),
    featured: z.boolean().default(false),
    order: z.number().int().nonnegative().default(0),
  }),
});

export const collections = { projects };
