import { expect, test, type Page } from "@playwright/test";

const REPO = "https://api.github.com/repos/dimatx/shymoose-garden";
const NOTES = "src/content/notes";

/** In-memory stand-in for the GitHub Contents API. */
async function fakeGitHub(page: Page, files: Record<string, string>, { push = true } = {}) {
  const store = new Map(Object.entries(files).map(([slug, body]) => [
    `${NOTES}/${slug}.md`,
    { text: `---\nplant: ${slug}\n---\n\n${body}\n`, sha: `sha-${slug}-0` },
  ]));
  const writes: { method: string; path: string; body: any }[] = [];
  let version = 0;
  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/user") return json(200, { login: "gardener" });
    if (url.href.startsWith(`${REPO}?`) || url.href === REPO) return json(200, { permissions: { push } });
    const path = decodeURIComponent(url.pathname.replace("/repos/dimatx/shymoose-garden/contents/", ""));
    if (path === NOTES) {
      return json(200, [...store.keys()].map((p) => ({ name: p.slice(NOTES.length + 1) })));
    }
    if (request.method() === "GET") {
      const file = store.get(path);
      return file
        ? json(200, { sha: file.sha, content: Buffer.from(file.text).toString("base64").replace(/(.{60})/g, "$1\n") })
        : json(404, { message: "Not Found" });
    }
    const body = request.postDataJSON();
    writes.push({ method: request.method(), path, body });
    if (request.method() === "DELETE") {
      store.delete(path);
      return json(200, {});
    }
    const sha = `sha-${++version}`;
    store.set(path, { text: Buffer.from(body.content, "base64").toString(), sha });
    return json(201, { content: { sha } });
  });
  await page.addInitScript(() => localStorage.setItem("garden-notes:github-token", "test-token"));
  return { store, writes };
}

const notes = (page: Page) => page.getByRole("textbox", { name: "Garden notes" });

test("plant footer links straight to that plant's notes", async ({ page }) => {
  await page.goto("/plants/acer-palmatum-crimson-queen/");
  const link = page.getByRole("link", { name: /garden notes.*Crimson Queen/ });
  await expect(link).toHaveAttribute("href", "/admin/?plant=acer-palmatum-crimson-queen");
  await expect(link).toHaveAttribute("data-astro-reload", "");
});

test("signed-out visitors are asked to sign in with GitHub", async ({ page }) => {
  await page.goto("/admin/?plant=allium-avatar");
  await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});

test("accounts without write access are told they can't publish", async ({ page }) => {
  await fakeGitHub(page, {}, { push: false });
  await page.goto("/admin/");
  await expect(page.getByRole("heading", { name: "This account can't publish" })).toBeVisible();
});

test("choosing a plant always loads that plant's own published note", async ({ page }) => {
  await fakeGitHub(page, { "allium-avatar": "Avatar note", "acer-palmatum-crimson-queen": "Maple note" });
  await page.goto("/admin/?plant=allium-avatar");
  await expect(notes(page)).toHaveValue("Avatar note");
  await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();

  await page.getByRole("link", { name: "All plants" }).click();
  await page.getByRole("searchbox", { name: "Search plants" }).fill("crimson queen");
  await page.getByRole("link", { name: /Crimson Queen/ }).click();
  await expect(page).toHaveURL(/\?plant=acer-palmatum-crimson-queen$/);
  await expect(notes(page)).toHaveValue("Maple note");

  await page.getByRole("link", { name: "All plants" }).click();
  await page.getByRole("searchbox", { name: "Search plants" }).fill("");
  await page.getByRole("button", { name: /With notes/ }).click();
  await expect(page.locator("[data-plant-row]:visible")).toHaveCount(2);
  await page.getByRole("button", { name: "All plants" }).click();
  await page.getByRole("link", { name: /Inaba-shidare/ }).click();
  await expect(notes(page)).toHaveValue("");
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
});

test("publishing writes the note file, and leaving unpublished work asks first", async ({ page }) => {
  const github = await fakeGitHub(page, { "allium-avatar": "Avatar note" });
  await page.goto("/admin/?plant=allium-avatar");
  await expect(notes(page)).toHaveValue("Avatar note");

  await notes(page).fill("Avatar note\n\nBloomed early — late May.");
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "All plants" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish your changes?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toBeHidden();
  await expect(notes(page)).toHaveValue(/late May/);

  await page.getByRole("link", { name: "All plants" }).click();
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Garden notes", level: 1 })).toBeVisible();
  expect(github.writes).toHaveLength(0);

  await page.getByRole("link", { name: /Avatar/ }).click();
  await expect(notes(page)).toHaveValue("Avatar note\n\nBloomed early — late May.");
  await expect(page.getByText(/saved on this device and not published yet/)).toBeVisible();
  await expect(page.getByText("Draft — not published")).toBeVisible();

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Published! The plant page updates/)).toBeVisible();
  expect(github.writes).toEqual([
    expect.objectContaining({ method: "PUT", path: `${NOTES}/allium-avatar.md` }),
  ]);
  expect(github.writes[0].body).toMatchObject({ sha: "sha-allium-avatar-0", branch: "main", message: expect.stringMatching(/^Update garden notes for Allium/) });
  expect(github.store.get(`${NOTES}/allium-avatar.md`)!.text).toBe(
    "---\nplant: allium-avatar\n---\n\nAvatar note\n\nBloomed early — late May.\n",
  );
  await expect(page.getByText(/saved on this device/)).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("garden-notes:draft:allium-avatar"))).toBeNull();

  // Nothing unpublished now, so leaving needs no prompt.
  await page.getByRole("link", { name: "All plants" }).click();
  await expect(dialog).toBeHidden();
});

test("discarding unpublished changes leaves without saving anything", async ({ page }) => {
  const github = await fakeGitHub(page, {});
  await page.goto("/admin/?plant=allium-avatar");
  await notes(page).fill("Scratch");
  await page.getByRole("link", { name: "All plants" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Discard changes" }).click();
  await page.getByRole("link", { name: /Avatar/ }).click();
  await expect(notes(page)).toHaveValue("");
  expect(github.writes).toHaveLength(0);
});

test("the whole plant list scrolls with the page", async ({ page }) => {
  await fakeGitHub(page, {});
  await page.goto("/admin/");
  const rows = page.locator("[data-plant-row]");
  expect(await rows.count()).toBeGreaterThan(50);
  const last = rows.last().getByRole("link");
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await last.click();
  await expect(page).toHaveURL(/\?plant=/);
});
