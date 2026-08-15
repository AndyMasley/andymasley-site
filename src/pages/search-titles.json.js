import { buildTitlesShard } from '@/lib/search-index';

// The titles-only shard: instant first results on the first keystroke
// while the full-text index streams behind it.
export async function GET() {
  return new Response(JSON.stringify(await buildTitlesShard()), {
    headers: { 'Content-Type': 'application/json' },
  });
}
