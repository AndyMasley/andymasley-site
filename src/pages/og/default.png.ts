import type { APIRoute } from 'astro';
import { renderOgCard } from '@/lib/og-card';

export const GET: APIRoute = async () => {
  const png = await renderOgCard({ title: 'Andy Masley', date: null });
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
