// Build-time utilities for extracting headings from HTML and stripping inline TOCs

export interface TOCHeading {
  id: string;
  text: string;
  level: 'section' | 'sub';
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function generateId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Strip inline "Contents" / "Table of Contents" sections from HTML.
 * Matches an h1/h2 with text "Contents" (case-insensitive) followed by
 * content until the next heading of the same level or end.
 */
export function stripContentsSection(html: string): string {
  // Match <h1>Contents</h1> or <h1><strong>Contents</strong></h1> etc.
  // Remove everything from that heading to the next <h1
  const contentsPattern = /<h1[^>]*>(?:<[^>]*>)*\s*(?:Table of )?Contents\s*(?:<[^>]*>)*<\/h1>/gi;
  let match = contentsPattern.exec(html);
  if (match) {
    const start = match.index;
    const afterHeading = start + match[0].length;
    // Find the next <h1 after the Contents heading
    const nextH1 = html.indexOf('<h1', afterHeading);
    const end = nextH1 !== -1 ? nextH1 : afterHeading;
    // Also consume any list/paragraph content between Contents and next h1
    // by finding the actual content block end
    let contentEnd = end;
    if (nextH1 === -1) {
      // No next h1 — just remove the heading and the list that follows
      const listEnd = html.indexOf('</ul>', afterHeading);
      contentEnd = listEnd !== -1 ? listEnd + 5 : afterHeading;
    }
    return html.slice(0, start) + html.slice(contentEnd);
  }

  // Also try h2-level Contents sections
  const h2ContentsPattern = /<h2[^>]*>(?:<[^>]*>)*\s*(?:Table of )?Contents\s*(?:<[^>]*>)*<\/h2>/gi;
  match = h2ContentsPattern.exec(html);
  if (match) {
    const start = match.index;
    const afterHeading = start + match[0].length;
    const nextH2 = html.indexOf('<h2', afterHeading);
    const nextH1 = html.indexOf('<h1', afterHeading);
    const end = Math.min(
      nextH2 !== -1 ? nextH2 : Infinity,
      nextH1 !== -1 ? nextH1 : Infinity
    );
    const contentEnd = end !== Infinity ? end : afterHeading;
    return html.slice(0, start) + html.slice(contentEnd);
  }

  return html;
}

/**
 * Also strip "This post in a nutshell" sections (common in Substack posts).
 */
export function stripNutshellSection(html: string): string {
  const pattern = /<h1[^>]*>(?:<[^>]*>)*\s*This post in a nutshell\s*(?:<[^>]*>)*<\/h1>/gi;
  const match = pattern.exec(html);
  if (!match) return html;

  const start = match.index;
  const afterHeading = start + match[0].length;
  const nextH1 = html.indexOf('<h1', afterHeading);
  const end = nextH1 !== -1 ? nextH1 : afterHeading;
  // Consume content until next h1
  let contentEnd = end;
  if (nextH1 === -1) {
    const listEnd = html.indexOf('</ul>', afterHeading);
    const olEnd = html.indexOf('</ol>', afterHeading);
    const furthest = Math.max(
      listEnd !== -1 ? listEnd + 5 : afterHeading,
      olEnd !== -1 ? olEnd + 5 : afterHeading
    );
    contentEnd = furthest;
  }
  return html.slice(0, start) + html.slice(contentEnd);
}

/**
 * Extract headings from HTML content for sidebar TOC.
 * Returns normalized headings and cleaned HTML.
 */
export function extractHeadingsFromHtml(html: string): { headings: TOCHeading[]; cleanedHtml: string } {
  // Strip Contents and Nutshell sections
  let cleaned = stripContentsSection(html);
  cleaned = stripNutshellSection(cleaned);

  // Find all headings (h1-h3) with multiline support
  const headingRegex = /<(h[1-3])([^>]*)>([\s\S]*?)<\/\1>/gi;
  const found: { tag: string; id: string; text: string }[] = [];
  let m: RegExpExecArray | null;

  while ((m = headingRegex.exec(cleaned)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const innerHtml = m[3];
    // Drop the appended section anchor (§) so it never leaks into TOC labels.
    const text = stripTags(innerHtml.replace(/<a class="h-anchor"[\s\S]*?<\/a>/gi, ''));
    if (!text) continue;

    // Get ID from attribute or generate one
    const idMatch = attrs.match(/id="([^"]+)"/);
    const id = idMatch ? idMatch[1] : generateId(text);

    found.push({ tag, id, text });
  }

  if (found.length === 0) return { headings: [], cleanedHtml: cleaned };

  // Determine heading level mapping:
  // Count h1s and h2s to figure out the structural pattern
  const h1Count = found.filter(h => h.tag === 'h1').length;
  const h2Count = found.filter(h => h.tag === 'h2').length;

  let sectionTag: string;
  let subTag: string;

  if (h1Count >= 2) {
    // Substack-style: h1 = sections, h2 = subs
    sectionTag = 'h1';
    subTag = 'h2';
  } else {
    // Standard: h2 = sections, h3 = subs
    sectionTag = 'h2';
    subTag = 'h3';
  }

  const headings: TOCHeading[] = found
    .filter(h => h.tag === sectionTag || h.tag === subTag)
    .map(h => ({
      id: h.id,
      text: h.text,
      level: h.tag === sectionTag ? 'section' as const : 'sub' as const,
    }));

  return { headings, cleanedHtml: cleaned };
}
