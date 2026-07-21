import type { APIRoute } from 'astro';
import { renderDefaultOgCard } from '@/lib/og-card';

export const GET: APIRoute = async () => {
  const png = await renderDefaultOgCard();
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
