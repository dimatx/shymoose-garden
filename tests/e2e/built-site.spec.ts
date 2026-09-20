import { expect, test } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

test("generated pages have no broken local links or asset references", () => {
  const root = path.resolve("dist");
  const htmlFiles = readdirSync(root, { recursive: true })
    .filter((file): file is string => typeof file === "string" && file.endsWith(".html"));
  expect(htmlFiles.length).toBeGreaterThan(100);
  const missing = new Set<string>();
  for (const file of htmlFiles) {
    const html = readFileSync(path.join(root, file), "utf8");
    for (const match of html.matchAll(/\b(?:href|src)="(\/[^"]*)"/g)) {
      const url = new URL(match[1], "https://garden.shymoose.com");
      if (url.origin !== "https://garden.shymoose.com") continue;
      const target = path.join(root, ...decodeURIComponent(url.pathname).split("/").filter(Boolean));
      if (!existsSync(target) || (statSync(target).isDirectory() && !existsSync(path.join(target, "index.html")))) {
        missing.add(`${file}: ${url.pathname}`);
      }
    }
  }
  expect([...missing]).toEqual([]);
});
