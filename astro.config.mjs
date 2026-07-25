// @ts-check
import { satteri } from '@astrojs/markdown-satteri';
import { defineConfig } from 'astro/config';
import { createProjectImageAttributesPlugin } from './src/utils/projectImages.mjs';

// https://astro.build/config
export default defineConfig({
  markdown: {
    processor: satteri({
      hastPlugins: [createProjectImageAttributesPlugin],
    }),
  },
});
