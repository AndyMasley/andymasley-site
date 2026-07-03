import type { APIRoute } from 'astro';
import { getAllWritingPostMetas } from '@/lib/all-writing-posts';
import { renderOgCard } from '@/lib/og-card';

export async function getStaticPaths() {
  const posts = await getAllWritingPostMetas();
  return posts.map((p) => ({
    params: { slug: p.slug },
    props: {
      title: p.title,
      date: p.date.getTime() === 0 ? null : p.date.toISOString(),
    },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOgCard({
    title: props.title as string,
    date: props.date ? new Date(props.date as string) : null,
  });
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
