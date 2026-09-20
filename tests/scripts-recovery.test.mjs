import test from "node:test";
import assert from "node:assert/strict";
import { recoverShortUrl } from "../scripts/lib/shortlinks.mjs";

const options = {
  baseUrl: "https://shlink.invalid/",
  apiKey: "offline-test-key",
  customSlug: "code",
  longUrl: "https://garden.invalid/plants/plant",
  title: "Plant",
};

function mockedRecovery(responses) {
  const calls = [];
  const run = () => recoverShortUrl({
    ...options,
    fetchImpl: async (url, init) => {
      calls.push({ url, ...init });
      const response = responses.shift();
      assert.ok(response, "unexpected extra request");
      if (response instanceof Error) throw response;
      return response;
    },
  });
  return { calls, run };
}

const conflict = (status = 400) => Response.json(
  { type: status === 400 ? "https://shlink.io/api/error/non-unique-slug" : "slug-conflict" },
  { status },
);

test("new recovery does not issue a destination lookup", async () => {
  const { calls, run } = mockedRecovery([Response.json({}, { status: 201 })]);
  assert.equal(await run(), "created");
  assert.deepEqual(calls.map(call => call.method), ["POST"]);
  assert.deepEqual(JSON.parse(calls[0].body), {
    longUrl: options.longUrl, title: options.title, customSlug: "code", tags: ["garden"],
  });
});

for (const status of [400, 409]) {
  test(`duplicate ${status} is successful only after destination verification`, async () => {
    const { calls, run } = mockedRecovery([conflict(status), Response.json({ longUrl: options.longUrl })]);
    assert.equal(await run(), "exists");
    assert.deepEqual(calls.map(call => call.method), ["POST", "GET"]);
    assert.equal(calls[1].url, "https://shlink.invalid/rest/v3/short-urls/code");
    for (const call of calls) {
      assert.equal(call.headers["X-Api-Key"], options.apiKey);
      assert.equal(call.redirect, "error");
      assert.ok(call.signal instanceof AbortSignal);
    }
  });
}

test("mismatched existing destinations fail without modifying the link", async () => {
  const { calls, run } = mockedRecovery([
    conflict(), Response.json({ longUrl: "https://garden.invalid/plants/another-plant" }),
  ]);
  await assert.rejects(run(), /different destination; left unchanged/);
  assert.deepEqual(calls.map(call => call.method), ["POST", "GET"]);
});

for (const [label, response] of [
  ["missing destination", () => Response.json({})],
  ["null details", () => Response.json(null)],
  ["invalid destination", () => Response.json({ longUrl: "javascript:alert(1)" })],
  ["invalid JSON", () => new Response("not JSON")],
  ["HTTP failure", () => new Response("", { status: 503 })],
  ["request failure", () => new Error("Connection lost")],
]) {
  test(`unverifiable duplicate (${label}) fails without overwriting`, async () => {
    const { calls, run } = mockedRecovery([conflict(), response()]);
    await assert.rejects(run(), /Could not verify existing short URL code; left unchanged/);
    assert.deepEqual(calls.map(call => call.method), ["POST", "GET"]);
  });
}

test("initial request failure is reported without attempting another request", async () => {
  const { calls, run } = mockedRecovery([new Error("Connection lost")]);
  await assert.rejects(run(), /Connection lost/);
  assert.deepEqual(calls.map(call => call.method), ["POST"]);
});

test("non-conflict API errors are not reported as existing links", async () => {
  const { calls, run } = mockedRecovery([Response.json({ detail: "Not authorized" }, { status: 401 })]);
  await assert.rejects(run(), /HTTP 401/);
  assert.deepEqual(calls.map(call => call.method), ["POST"]);
});
