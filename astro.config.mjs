// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://garden.shymoose.com",

  // Prefetch the HTML for in-view links so tapping a plant navigates near
  // instantly (the document is already cached before the tap). `viewport`
  // only prefetches links as they scroll into view, so the cost tracks what
  // the visitor is actually looking at — well suited to this mobile, QR-driven
  // catalog. Works hand-in-hand with the <ClientRouter /> view transitions.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "viewport",
  },

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