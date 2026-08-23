// Namespaced under /og/page/ so section-page card ids can never collide with
// writing-post slugs at /og/[slug].png.
import type { APIRoute } from 'astro';
import { renderOgCard, renderHomeOgCard, loadPanelImage } from '@/lib/og-card';
import { ogPages, type OgPage } from '@/lib/og-pages';

export function getStaticPaths() {
  return Object.entries(ogPages).map(([id, page]) => ({ params: { id }, props: { page } }));
}

export const GET: APIRoute = async ({ params, props }) => {
  const page = props.page as OgPage;
  const panel = page.panel && 'image' in page.panel ? { image: loadPanelImage(page.panel.image) } : page.panel;
  const png = params.id === 'home' ? await renderHomeOgCard() : await renderOgCard({ title: page.title, panel });
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
