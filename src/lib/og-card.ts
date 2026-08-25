// Build-time Open Graph card renderer. satori turns an element tree into SVG,
// resvg rasterizes it to PNG. Ink-on-paper: white canvas, ink hexagon mark,
// Gelasio (the metric twin of the site's Georgia) at build time only — this
// font never ships to the client.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatPostDate } from './format-date';

// Resolve from the project root: after bundling this module lives in
// dist/chunks/, so an import.meta.url-relative path would miss. OG generation
// only ever runs at build time, where cwd is the project root.
const fontDir = join(process.cwd(), 'src/assets/fonts');
const gelasio400 = readFileSync(join(fontDir, 'gelasio-400.woff'));
const gelasio700 = readFileSync(join(fontDir, 'gelasio-700.woff'));

// Page screenshots for the section/visual cards, captured from the built site
// at 2× the panel size (1168×860) and committed under src/assets/og/.
const panelDir = join(process.cwd(), 'src/assets/og');
export function loadPanelImage(id: string): string {
  return 'data:image/png;base64,' + readFileSync(join(panelDir, `${id}.png`)).toString('base64');
}

// The homepage headshot, shared with the page itself.
const headshotUri =
  'data:image/jpeg;base64,' + readFileSync(join(process.cwd(), 'public/images/headshot.jpg')).toString('base64');

// Ink hexagon mark, matching the site favicon/header (not the old oxblood).
// Stroke width is in 24-unit viewBox units, so it does NOT scale with size —
// the small header mark needs 2.5, the oversized card hexagons need a
// hairline 0.2 (≈5px rendered) to read as a drafting line rather than a slab.
function hexDataUri(size: number, strokeWidth: number, stroke = '#1a1a1a'): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
    `<polygon points="12,2 20.66,7 20.66,17 12,22 3.34,17 3.34,7" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>` +
    '</svg>';
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}
const hexSmall = hexDataUri(44, 2.5);

async function rasterize(tree: unknown): Promise<Buffer> {
  const svg = await satori(tree as any, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Gelasio', data: gelasio400, weight: 400, style: 'normal' },
      { name: 'Gelasio', data: gelasio700, weight: 700, style: 'normal' },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}

// Section, list, and visual pages carry a panel on the right instead of the
// decorative hexagon: a framed window onto the page itself (a screenshot), or
// for a bare index page, its entries set large enough to read.
export type CardPanel = { image: string } | { lines: string[] };

interface CardInput {
  title: string;
  date?: Date | null;
  panel?: CardPanel;
}

const PANEL_W = 584;
const PANEL_H = 430;
// The site's hairline (--border-strong) at card scale.
const PANEL_FRAME = '2px solid #d4d4d4';

function panelNode(panel: CardPanel) {
  const frame = {
    display: 'flex',
    width: `${PANEL_W}px`,
    height: `${PANEL_H}px`,
    border: PANEL_FRAME,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    flexShrink: 0,
  };
  if ('image' in panel) {
    return {
      type: 'div',
      props: {
        style: frame,
        children: [
          {
            type: 'img',
            props: {
              src: panel.image,
              width: PANEL_W - 4,
              height: PANEL_H - 4,
              style: { objectFit: 'cover', objectPosition: 'top left' },
            },
          },
        ],
      },
    };
  }
  // Entries as rows under hairlines, the list pages' own category-row recipe.
  return {
    type: 'div',
    props: {
      style: { ...frame, flexDirection: 'column', justifyContent: 'center', padding: '0 40px' },
      children: panel.lines.map((line, i) => ({
        type: 'div',
        props: {
          style: {
            display: 'flex',
            padding: '22px 0',
            ...(i === 0 ? { borderTop: PANEL_FRAME } : {}),
            borderBottom: PANEL_FRAME,
            fontSize: '32px',
            fontWeight: 700,
            lineHeight: 1.3,
            color: '#1a1a1a',
          },
          children: line,
        },
      })),
    },
  };
}

export async function renderOgCard({ title, date, panel }: CardInput): Promise<Buffer> {
  if (panel) return renderPanelCard(title, panel);
  const titleSize = title.length > 90 ? 54 : 66;
  const dateStr = date && date.getTime() !== 0 ? formatPostDate(date) : '';

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
        position: 'relative',
        overflow: 'hidden',
      },
      children: [
        // The one drawing of the mark, shared with the default card but at
        // a lighter gray stroke so the title stays dominant: an oversized
        // hairline hexagon cropped by the right edge.
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              position: 'absolute',
              top: '50%',
              right: '-165px',
              transform: 'translateY(-50%)',
            },
            children: [
              { type: 'img', props: { src: hexDataUri(620, 0.2, '#e0e0e0'), width: 620, height: 620 } },
            ],
          },
        },
        // Header: hexagon mark + wordmark
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center' },
            children: [
              { type: 'img', props: { src: hexSmall, width: 44, height: 44 } },
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
        // Footer: date left, domain right (blue because on this site blue
        // means "link" — the one working color, shared with the default card)
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
              { type: 'div', props: { style: { color: '#1f5a7a' }, children: 'andymasley.com' } },
            ],
          },
        },
      ],
    },
  };

  return rasterize(tree);
}

// Header and domain as on the article card; the title sits in a 440px column
// left of the panel, so it is set smaller and wraps more.
async function renderPanelCard(title: string, panel: CardPanel): Promise<Buffer> {
  const titleSize = title.length > 32 ? 46 : title.length > 18 ? 54 : 64;

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
        fontFamily: 'Gelasio',
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', flexShrink: 0 },
            children: [
              { type: 'img', props: { src: hexSmall, width: 44, height: 44 } },
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
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '28px', flexGrow: 1 },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', width: '440px', height: `${PANEL_H}px` },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', alignItems: 'center', flexGrow: 1, overflow: 'hidden' },
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
                                lineClamp: 5,
                                overflow: 'hidden',
                              },
                              children: title,
                            },
                          },
                        ],
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', fontSize: '26px', color: '#1f5a7a', flexShrink: 0 },
                        children: 'andymasley.com',
                      },
                    },
                  ],
                },
              },
              panelNode(panel),
            ],
          },
        },
      ],
    },
  };

  return rasterize(tree);
}

const DEFAULT_TAGLINE = 'Essays on AI and the environment, animal welfare, effective altruism, and more';

// The homepage card: the default card's text column, with the headshot from
// the top of the page where the default card has its hexagon.
export async function renderHomeOgCard(): Promise<Buffer> {
  const photoSize = 430;
  const tree = {
    type: 'div',
    props: {
      style: {
        width: '1200px',
        height: '630px',
        backgroundColor: '#ffffff',
        padding: '64px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: 'Gelasio',
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', width: '580px' },
            children: [
              {
                type: 'div',
                props: {
                  style: { fontSize: '84px', fontWeight: 400, color: '#1a1a1a', lineHeight: 1.05 },
                  children: 'Andy Masley',
                },
              },
              {
                type: 'div',
                props: {
                  style: { marginTop: '30px', fontSize: '34px', color: '#666666', lineHeight: 1.4, width: '540px' },
                  children: DEFAULT_TAGLINE,
                },
              },
              {
                type: 'div',
                props: {
                  style: { marginTop: '52px', fontSize: '28px', color: '#1f5a7a' },
                  children: 'andymasley.com',
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', width: `${photoSize}px`, height: `${photoSize}px`, border: PANEL_FRAME, flexShrink: 0 },
            children: [
              { type: 'img', props: { src: headshotUri, width: photoSize - 4, height: photoSize - 4, style: { objectFit: 'cover' } } },
            ],
          },
        },
      ],
    },
  };

  return rasterize(tree);
}

// The site-identity card (homepage, 404, and any page without its own image):
// one oversized hairline hexagon bleeding off the right edge carries the
// identity, so the text only has to say the name once.
export async function renderDefaultOgCard(): Promise<Buffer> {
  const tree = {
    type: 'div',
    props: {
      style: {
        width: '1200px',
        height: '630px',
        backgroundColor: '#ffffff',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'Gelasio',
      },
      children: [
        // Oversized mark, vertically centered, cropped by the right edge
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              position: 'absolute',
              top: '50%',
              right: '-165px',
              transform: 'translateY(-50%)',
            },
            children: [
              { type: 'img', props: { src: hexDataUri(620, 0.2), width: 620, height: 620 } },
            ],
          },
        },
        // Text column
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              height: '100%',
              paddingLeft: '96px',
              maxWidth: '720px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { fontSize: '84px', fontWeight: 400, color: '#1a1a1a', lineHeight: 1.05 },
                  children: 'Andy Masley',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    marginTop: '30px',
                    fontSize: '34px',
                    color: '#666666',
                    lineHeight: 1.4,
                    width: '560px',
                  },
                  children: DEFAULT_TAGLINE,
                },
              },
              {
                type: 'div',
                props: {
                  style: { marginTop: '52px', fontSize: '28px', color: '#1f5a7a' },
                  children: 'andymasley.com',
                },
              },
            ],
          },
        },
      ],
    },
  };

  return rasterize(tree);
}
