import { expect, test } from "@playwright/test";

interface CameraStub {
  requested: number;
  stopped: number;
  played: number;
  grant: () => void;
}

declare global {
  interface Window {
    scannerCamera: CameraStub;
  }
}

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state: CameraStub = {
      requested: 0,
      stopped: 0,
      played: 0,
      grant: () => { throw new Error("Camera has not been requested"); },
    };
    window.scannerCamera = state;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: () => {
        state.requested++;
        return new Promise<MediaStream>((resolve) => {
          state.grant = () => {
            const stream = new MediaStream();
            Object.defineProperty(stream, "getTracks", {
              value: () => [{ stop: () => { state.stopped++; } }],
            });
            resolve(stream);
          };
        });
      },
    });
    HTMLMediaElement.prototype.play = async function () {
      state.played++;
    };
  });
  await page.goto("/");
});

test("scanner is modal, restores focus, and restores the previous scroll setting", async ({ page }) => {
  const opener = page.locator("#qr-scan-button");
  const dialog = page.getByRole("dialog", { name: "Scan plant QR code" });
  const close = page.getByRole("button", { name: "Close QR scanner" });
  await page.evaluate(() => { document.body.style.overflow = "auto"; });
  await opener.click();
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  // Native modal inertness prevents focus from escaping to the page beneath it.
  await opener.evaluate((element) => element.focus());
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("overflow", "auto");

  await opener.click();
  await close.click();
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test("granting camera permission after closing stops the stream without playing it", async ({ page }) => {
  await page.locator("#qr-scan-button").click();
  await expect.poll(() => page.evaluate(() => window.scannerCamera.requested)).toBe(1);
  await page.getByRole("button", { name: "Close QR scanner" }).click();
  await page.evaluate(() => window.scannerCamera.grant());

  await expect.poll(() => page.evaluate(() => window.scannerCamera.stopped)).toBe(1);
  expect(await page.evaluate(() => window.scannerCamera.played)).toBe(0);
  expect(await page.locator("#qr-video").evaluate((video: HTMLVideoElement) => video.srcObject)).toBeNull();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator("#qr-scan-button")).toBeFocused();
});

test("disconnecting a scanner invalidates pending camera work and removes its opener handler", async ({ page }) => {
  await page.locator("#qr-scan-button").click();
  await expect.poll(() => page.evaluate(() => window.scannerCamera.requested)).toBe(1);
  await page.evaluate(() => document.querySelector("garden-qr-scanner")?.remove());
  await page.evaluate(() => window.scannerCamera.grant());
  await expect.poll(() => page.evaluate(() => window.scannerCamera.stopped)).toBe(1);
  expect(await page.evaluate(() => window.scannerCamera.played)).toBe(0);
  await page.locator("#qr-scan-button").click();
  expect(await page.evaluate(() => window.scannerCamera.requested)).toBe(1);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});
