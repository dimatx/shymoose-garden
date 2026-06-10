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

  // Inline each page's CSS into its HTML. The stylesheets are small, and this
  // removes a render-blocking <link> round-trip — a clear win for a QR-driven
  // site where visitors usually land on a single page.
  build: {
    inlineStylesheets: "always",
  },

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [sitemap()],
});