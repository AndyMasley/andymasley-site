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

// Music - reviews, recommendations, notes on albums/artists
const music = defineCollection({
  type: 'content',
  schema: baseSchema.extend({
    artist: z.string().optional(),
    album: z.string().optional(),
    year: z.number().optional(),
    rating: z.number().min(0).max(10).optional(),
    genre: z.array(z.string()).default([]),
    listen_link: z.string().url().optional(),
  }),
});

// Film - reviews, notes
const film = defineCollection({
  type: 'content',
  schema: baseSchema.extend({
    director: z.string().optional(),
    year: z.number().optional(),
    rating: z.number().min(0).max(10).optional(),
    genre: z.array(z.string()).default([]),
    watch_link: z.string().url().optional(),
  }),
});

// Books - reviews, notes
const books = defineCollection({
  type: 'content',
  schema: baseSchema.extend({
    author: z.string().optional(),
    year: z.number().optional(),
    rating: z.number().min(0).max(10).optional(),
    genre: z.array(z.string()).default([]),
    goodreads: z.string().url().optional(),
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
  music,
  film,
  books,
  notes,
  physics,
  categories,
};
