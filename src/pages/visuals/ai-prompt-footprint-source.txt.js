// Serves the final source of the AI prompt footprint page as plain text, so anyone
// can copy the complete code without browsing the edit history. The current .astro
// file is inlined at build time via Vite's ?raw import.
import source from './ai-prompt-footprint.astro?raw';

export function GET() {
  return new Response(source, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
