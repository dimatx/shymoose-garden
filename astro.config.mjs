// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://garden.shymoose.com",

  // Prefetch the HTML for links on hover/focus so tapping a plant navigates
  // near instantly. `viewport` caused all in-view cards to prefetch at once,
  // saturating the browser's 6-connection limit and stalling actual navigations
  // for up to 20 s. `hover` fires just-in-time on desktop; on mobile (QR
  // visitors) no prefetch fires, which is fine — Cloudflare responds in ~50 ms.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
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