// @ts-check
import { satteri } from '@astrojs/markdown-satteri';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { createProjectImageAttributesPlugin } from './src/utils/projectImages.mjs';

const indexedPaths = new Set([
  '/',
  '/projects/gor/',
  '/projects/tabs4me/',
  '/projects/bravo-optika/',
  '/projects/optima-servis/',
  '/projects/amelisoul/',
]);

// https://astro.build/config
export default defineConfig({
  site: 'https://versh-konstantin.ru',
  integrations: [
    sitemap({
      filter: (page) => indexedPaths.has(new URL(page).pathname),
    }),
  ],
  markdown: {
    processor: satteri({
      hastPlugins: [createProjectImageAttributesPlugin],
    }),
  },
});
