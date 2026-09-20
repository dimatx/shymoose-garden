// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://garden.shymoose.com",

  // Do NOT prefetch *all* links site-wide. Instead, plant cards opt in with
  // data-astro-prefetch="viewport" so each page's HTML is fetched as the card
  // scrolls into view — making clicks (including touch, which never fires the
  // default hover strategy) instant instead of paying a 600 ms+ HTML round-trip
  // on slow networks. HTTP/3 multiplexing means these low-priority prefetches
  // share one connection and never stall the real navigation.
  prefetch: true,

  // Share/cache larger stylesheets across pages; inline only small ones.
  build: {
    inlineStylesheets: "auto",
  },

  vite: {
    // Cast around a harmless typings clash: @tailwindcss/vite is typed against
    // the root `vite`, while Astro bundles its own copy under
    // astro/node_modules/vite. The two `Plugin` types are structurally
    // incompatible, so TS rejects the array even though it works at runtime.
    plugins: [/** @type {any} */ (tailwindcss())],
  },

  integrations: [sitemap()],
});