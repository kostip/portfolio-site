import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    year: z.string().optional(),
    role: z.string(),
    duration: z.string().optional(),
    team: z.string().optional(),
    product: z.string().optional(),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    titleIcon: z.string().optional(),
    titleIconAlt: z.string().optional(),
    cardTitle: z.string().optional(),
    cardDescription: z.string().optional(),
    tags: z.array(z.string()).optional(),
    accent: z.string().optional(),
    featured: z.boolean().default(false),
    order: z.number().int().positive().optional(),
  }),
});

export const collections = { projects };
