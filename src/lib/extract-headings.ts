// Build-time utilities for extracting headings from HTML and stripping inline TOCs

export interface TOCHeading {
  id: string;
  text: string;
  level: 'section' | 'sub';
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

// TOC labels are plain strings, so the source's character entities must be
// decoded once here — otherwise "Mindset &amp; motivation" reaches the rail
// as literal text. &amp; goes last so double-encoded entities stay encoded.
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
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
  // Matches at h1 or h2 (normalizeHeadings demotes Substack's body h1s to
  // h2) and tolerates the literal § text of the appended h-anchor — the old
  // tags-only pattern silently stopped matching once anchors were added.
  const pattern = /<(h[12])[^>]*>(?:<[^>]*>|§|\s)*(?:Table of )?Contents:?(?:<[^>]*>|§|\s)*<\/\1>/i;
  const match = pattern.exec(html);
  if (!match) return html;

  const level = match[1].toLowerCase();
  const start = match.index;
  const afterHeading = start + match[0].length;
  // Remove everything up to the next heading of the same or higher level.
  const nextSame = html.indexOf(`<${level}`, afterHeading);
  const nextHigher = level === 'h2' ? html.indexOf('<h1', afterHeading) : -1;
  const candidates = [nextSame, nextHigher].filter(i => i !== -1);
  let contentEnd = candidates.length ? Math.min(...candidates) : afterHeading;
  if (!candidates.length) {
    // No later heading — remove the heading plus the link list that follows.
    const listEnd = html.indexOf('</ul>', afterHeading);
    contentEnd = listEnd !== -1 ? listEnd + 5 : afterHeading;
  }
  return html.slice(0, start) + html.slice(contentEnd);
}

/**
 * Also strip "This post in a nutshell" sections (common in Substack posts).
 */
export function stripNutshellSection(html: string): string {
  // Matches at h1 or h2: normalizeHeadings demotes Substack's body h1s to h2,
  // and older un-normalized content may still carry the h1 form.
  const pattern = /<(h[12])[^>]*>(?:<[^>]*>|§|\s)*This post in a nutshell(?:<[^>]*>|§|\s)*<\/\1>/i;
  const match = pattern.exec(html);
  if (!match) return html;

  const level = match[1].toLowerCase();
  const start = match.index;
  const afterHeading = start + match[0].length;
  // Consume content until the next heading of the same or higher level.
  const nextSame = html.indexOf(`<${level}`, afterHeading);
  const nextHigher = level === 'h2' ? html.indexOf('<h1', afterHeading) : -1;
  const candidates = [nextSame, nextHigher].filter(i => i !== -1);
  let contentEnd = candidates.length ? Math.min(...candidates) : afterHeading;
  if (!candidates.length) {
    const listEnd = html.indexOf('</ul>', afterHeading);
    const olEnd = html.indexOf('</ol>', afterHeading);
    contentEnd = Math.max(
      listEnd !== -1 ? listEnd + 5 : afterHeading,
      olEnd !== -1 ? olEnd + 5 : afterHeading
    );
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
    const raw = stripTags(innerHtml.replace(/<a class="h-anchor"[\s\S]*?<\/a>/gi, ''));
    if (!raw) continue;
    const text = decodeEntities(raw);

    // Get ID from attribute or generate one (from the un-decoded text, so
    // generated ids match what this function always produced).
    const idMatch = attrs.match(/id="([^"]+)"/);
    const id = idMatch ? idMatch[1] : generateId(raw);

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
