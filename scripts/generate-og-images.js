import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(ROOT, "public", "images", "og");
const FONT_PATH = join(__dirname, "fonts", "Inter-Medium.ttf");

const pages = [
  { filename: "og-default.png", title: "Andy Masley" },
  { filename: "og-writing.png", title: "Writing" },
  { filename: "og-physics.png", title: "IB Physics" },
  { filename: "og-lists.png", title: "Lists" },
  { filename: "og-visuals.png", title: "Visuals" },
  { filename: "og-contact.png", title: "Contact" },
  { filename: "og-appearances.png", title: "Appearances" },
  { filename: "og-notes.png", title: "Notes" },
  { filename: "og-tags.png", title: "Tags" },
  { filename: "og-favorite-things.png", title: "Favorite things" },
  { filename: "og-ai-music.png", title: "AI music" },
  { filename: "og-dc-vegan-dining.png", title: "Great DC restaurants for vegans" },
  { filename: "og-dc-vegan-restaurants.png", title: "Good DC restaurants for vegans" },
  { filename: "og-product-recommendations.png", title: "Product recommendations" },
  { filename: "og-carbon-footprint.png", title: "Carbon footprint calculator" },
  { filename: "og-factory-farmed-chickens.png", title: "Factory farmed chickens" },
];

const WIDTH = 1200;
const HEIGHT = 630;

function buildMarkup(title) {
  // Use smaller font for longer titles
  const fontSize = title.length > 25 ? 52 : 64;

  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "#faf9f7",
        padding: "80px",
      },
      children: [
        // Thin decorative line near top
        {
          type: "div",
          props: {
            style: {
              width: "100%",
              height: "1px",
              backgroundColor: "#DDD9D0",
              marginBottom: "auto",
            },
          },
        },
        // Title
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flexGrow: 1,
            },
            children: {
              type: "div",
              props: {
                style: {
                  fontSize: `${fontSize}px`,
                  fontFamily: "Inter",
                  fontWeight: 500,
                  color: "#1A1A18",
                  lineHeight: 1.2,
                },
                children: title,
              },
            },
          },
        },
        // Site URL at bottom
        {
          type: "div",
          props: {
            style: {
              fontSize: "20px",
              fontFamily: "Inter",
              fontWeight: 500,
              color: "#8b3a3a",
              marginTop: "auto",
            },
            children: "andymasley.com",
          },
        },
      ],
    },
  };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const fontData = readFileSync(FONT_PATH);

  const fonts = [
    {
      name: "Inter",
      data: fontData,
      weight: 500,
      style: "normal",
    },
  ];

  for (const page of pages) {
    const markup = buildMarkup(page.title);
    const svg = await satori(markup, { width: WIDTH, height: HEIGHT, fonts });
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: WIDTH },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    const outPath = join(OUTPUT_DIR, page.filename);
    writeFileSync(outPath, pngBuffer);
    console.log(`Generated ${page.filename} (${pngBuffer.length} bytes)`);
  }

  console.log(`\nDone. ${pages.length} images written to ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
