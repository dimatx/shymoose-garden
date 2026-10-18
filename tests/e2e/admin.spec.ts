import { expect, test } from "@playwright/test";

test("plant footer opens notes with its plant preselected and keeps the deep link", async ({ page }) => {
  await page.route("https://unpkg.com/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  );
  await page.goto("/plants/acer-palmatum-crimson-queen/");
  const link = page.getByRole("link", { name: /garden notes.*Crimson Queen/ });
  await expect(link).toHaveAttribute("data-astro-reload", "");
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/admin\/#\/collections\/notes\/(new\?plant=acer-palmatum-crimson-queen|entries\/.+)$/);
  await link.click();
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
  await page.reload();
  expect(new URL(page.url()).hash).toBe(href!.slice(href!.indexOf("#")));
});

for (const theme of ["light", "dark"] as const) {
  test(`notes editor inherits the garden's ${theme} preference`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme === "dark" ? "light" : "dark" });
    await page.addInitScript((preference) => {
      localStorage.setItem("theme", preference);
      localStorage.setItem("sveltia-cms.prefs", JSON.stringify({ underlineLinks: false }));
    }, theme);
    // Theme bootstrap and assets are local; OAuth and the external CMS are not
    // needed for this regression.
    await page.route("https://unpkg.com/**", (route) =>
      route.fulfill({ contentType: "text/javascript", body: "" }),
    );
    await page.goto("/admin/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const state = await page.evaluate(() => ({
      prefs: JSON.parse(localStorage.getItem("sveltia-cms.prefs")!),
      accent: getComputedStyle(document.documentElement)
        .getPropertyValue("--sui-primary-accent-color").trim(),
      font: getComputedStyle(document.documentElement)
        .getPropertyValue("--sui-font-family-default").trim(),
    }));
    expect(state.prefs).toEqual({ underlineLinks: false, theme });
    expect(state.accent).toBe("#2f7035");
    expect(state.font).toContain("Atkinson Hyperlegible");
  });
}
