// Meta posts configuration
// These are special overview/hub posts displayed in the META section
// They are excluded from the main timeline

export interface MetaPost {
  title: string;
  slug: string;
  url: string;
}

export const metaPosts: MetaPost[] = [
  {
    title: "An overview of my writing on AI and the environment",
    slug: "ai-and-the-environment",
    url: "https://andymasley.substack.com/p/ai-and-the-environment"
  },
  // Add more meta posts here as needed
];

// Get slugs for filtering from timeline
export function getMetaPostSlugs(): string[] {
  return metaPosts.map(p => p.slug);
}
