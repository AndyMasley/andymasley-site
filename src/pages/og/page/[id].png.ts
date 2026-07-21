// Namespaced under /og/page/ so section-page card ids can never collide with
// writing-post slugs at /og/[slug].png.
import type { APIRoute } from 'astro';
import { renderOgCard } from '@/lib/og-card';
import { ogPages } from '@/lib/og-pages';

export function getStaticPaths() {
  return Object.entries(ogPages).map(([id, title]) => ({ params: { id }, props: { title } }));
}

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOgCard({ title: props.title as string });
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
