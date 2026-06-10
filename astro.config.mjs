// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://garden.shymoose.com",

  // Do NOT prefetch all links. With 44+ plant cards on the index, even
  // hover-triggered prefetching saturates the browser's 6-connection limit and
  // stalls actual navigations for up to 20 s. Cloudflare serves pages in ~50 ms
  // so there is no meaningful latency to recover. Individual links can still
  // opt in via data-astro-prefetch if needed.
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