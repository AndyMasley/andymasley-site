import { defineCollection, z } from 'astro:content';

// Shared schema for all content with common fields
const baseSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  date: z.coerce.date(),
  updated: z.coerce.date().optional(),
  draft: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});

// Writing - essays, articles, blog posts
const writing = defineCollection({
  type: 'content',
  schema: baseSchema.extend({
    external_url: z.string().url().optional(), // For linking to Substack etc
    publication: z.string().optional(), // e.g. "Substack", "NYT"
  }),
});

// Notes - shorter wiki-style entries, ideas, TILs
const notes = defineCollection({
  type: 'content',
  schema: baseSchema.extend({
    category: z.string().optional(), // e.g. "idea", "til", "reference"
  }),
});

// Physics - IB Physics archive
const physics = defineCollection({
  type: 'content',
  schema: baseSchema.extend({
    unit: z.string().optional(),
    topic: z.string().optional(),
    youtube_url: z.string().url().optional(),
  }),
});

// Categories - for writing page category overviews
const categories = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    categorySlug: z.string(),
    shortName: z.string(),
    order: z.number(),
  }),
});

export const collections = {
  writing,
  notes,
  physics,
  categories,
};
