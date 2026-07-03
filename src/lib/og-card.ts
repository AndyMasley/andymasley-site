// Build-time Open Graph card renderer. satori turns an element tree into SVG,
// resvg rasterizes it to PNG. Ink-on-paper: white canvas, ink hexagon mark,
// Gelasio (the metric twin of the site's Georgia) at build time only — this
// font never ships to the client.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Resolve from the project root: after bundling this module lives in
// dist/chunks/, so an import.meta.url-relative path would miss. OG generation
// only ever runs at build time, where cwd is the project root.
const fontDir = join(process.cwd(), 'src/assets/fonts');
const gelasio400 = readFileSync(join(fontDir, 'gelasio-400.woff'));
const gelasio700 = readFileSync(join(fontDir, 'gelasio-700.woff'));

// Ink hexagon mark, matching the site favicon/header (not the old oxblood).
const hexSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24">' +
  '<polygon points="12,2 20.66,7 20.66,17 12,22 3.34,17 3.34,7" fill="none" stroke="#1a1a1a" stroke-width="2.5"/>' +
  '</svg>';
const hexDataUri = 'data:image/svg+xml;base64,' + Buffer.from(hexSvg).toString('base64');

function formatDate(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${mm}.${dd}.${d.getUTCFullYear()}`;
}

interface CardInput {
  title: string;
  date?: Date | null;
}

export async function renderOgCard({ title, date }: CardInput): Promise<Buffer> {
  const titleSize = title.length > 90 ? 54 : 66;
  const dateStr = date && date.getTime() !== 0 ? formatDate(date) : '';

  const tree = {
    type: 'div',
    props: {
      style: {
        width: '1200px',
        height: '630px',
        backgroundColor: '#ffffff',
        padding: '64px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        fontFamily: 'Gelasio',
      },
      children: [
        // Header: hexagon mark + wordmark
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center' },
            children: [
              { type: 'img', props: { src: hexDataUri, width: 44, height: 44 } },
              {
                type: 'div',
                props: {
                  style: { fontSize: '30px', color: '#666666', marginLeft: '18px' },
                  children: 'Andy Masley',
                },
              },
            ],
          },
        },
        // Title
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexGrow: 1,
              flexDirection: 'column',
              justifyContent: 'center',
              overflow: 'hidden',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'block',
                    fontSize: `${titleSize}px`,
                    fontWeight: 400,
                    color: '#1a1a1a',
                    lineHeight: 1.12,
                    // Clamp to 4 lines so an unusually long title can't collide
                    // with the footer.
                    lineClamp: 4,
                    overflow: 'hidden',
                  },
                  children: title,
                },
              },
            ],
          },
        },
        // Footer: date left, domain right
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '26px',
              color: '#666666',
            },
            children: [
              { type: 'div', props: { children: dateStr } },
              { type: 'div', props: { children: 'andymasley.com' } },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(tree as any, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Gelasio', data: gelasio400, weight: 400, style: 'normal' },
      { name: 'Gelasio', data: gelasio700, weight: 700, style: 'normal' },
    ],
  });

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return png;
}
