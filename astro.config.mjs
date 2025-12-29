import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://andymasley.com',
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
