import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
  site: 'https://andymasley.com',
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
