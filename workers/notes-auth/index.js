// Minimal GitHub OAuth proxy for the garden notes editor (/admin/), run as a
// Cloudflare Worker. It speaks the Decap-style popup postMessage handshake.
// Its only job is to keep the OAuth client secret out of the browser.
//
// Env: GITHUB_CLIENT_ID (var), GITHUB_CLIENT_SECRET (secret),
//      ALLOWED_ORIGIN (var, e.g. https://garden.shymoose.com)

const STATE_COOKIE = "oauth_state";

const html = (body, headers = {}) =>
  new Response(`<!doctype html><meta charset="utf-8"><body>${body}</body>`, {
    headers: { "content-type": "text/html;charset=utf-8", "cache-control": "no-store", ...headers },
  });

function resultPage(origin, status, payload) {
  const message = `authorization:github:${status}:${JSON.stringify(payload)}`;
  return html(
    `<script>
      (function () {
        var allowed = ${JSON.stringify(origin)};
        var message = ${JSON.stringify(message)};
        window.addEventListener("message", function (e) {
          if (e.origin !== allowed) return;
          window.opener.postMessage(message, allowed);
          window.close();
        });
        window.opener.postMessage("authorizing:github", allowed);
      })();
    </script>`,
    { "set-cookie": `${STATE_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax` },
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN;

    if (url.pathname === "/auth") {
      const state = crypto.randomUUID();
      const authorize = new URL("https://github.com/login/oauth/authorize");
      authorize.search = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        scope: "public_repo",
        state,
        redirect_uri: `${url.origin}/callback`,
      });
      return new Response(null, {
        status: 302,
        headers: {
          location: authorize.toString(),
          "set-cookie": `${STATE_COOKIE}=${state}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax`,
        },
      });
    }

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const cookie = /(?:^|;\s*)oauth_state=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1];
      if (!code || !state || state !== cookie) {
        return resultPage(origin, "error", { error: "Invalid or missing OAuth state" });
      }
      const res = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "user-agent": "shymoose-cms-auth" },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const data = await res.json();
      if (!data.access_token) {
        return resultPage(origin, "error", { error: data.error_description ?? "Token exchange failed" });
      }
      return resultPage(origin, "success", { token: data.access_token, provider: "github" });
    }

    return new Response("Not found", { status: 404 });
  },
};
