import { categoryConfigs } from '@/lib/substack';

// The one slug rule for topic filters. The archive grid, the essay meta
// kicker, and the /tags redirects all address the same shareable URLs
// (/writing?topic={slug}), so the mapping lives here rather than being
// re-derived in each page's frontmatter, where copies drift.
export function getCategorySlug(categoryName: string): string {
  if (categoryName === 'EA Forum') return 'ea-forum';
  const config = categoryConfigs.find(category => category.name === categoryName);
  return config?.slug || categoryName.toLowerCase().replace(/\s+/g, '-');
}

// Display names for the topic filter and the essay meta kicker — the
// category names in data carry Substack-era capitalization.
export function getCategoryDisplayName(categoryName: string): string {
  const names: Record<string, string> = {
    'AI & the Environment': 'AI & environment',
    'Artificial Intelligence': 'Artificial intelligence',
    'Animal Welfare': 'Animal welfare',
    'Charity': 'Effective altruism',
    'Politics': 'Politics',
    'Recs & Advice': 'Recs & advice',
    'Misc': 'Miscellaneous',
    'EA Forum': 'EA Forum',
  };
  return names[categoryName] || categoryName;
}
