# Notes editor auth Worker

Tiny OAuth proxy that lets the garden notes editor (`/admin/`) sign in with GitHub. It holds
the OAuth client secret so the browser never sees it. It is **not** deployed by
Cloudflare Pages — deploy it once by hand.

## One-time setup

1. **GitHub OAuth App** — github.com → Settings → Developer settings → OAuth
   Apps → New:
   - Homepage URL: `https://garden.shymoose.com`
   - Authorization callback URL: `https://shymoose-cms-auth.<your-subdomain>.workers.dev/callback`
     (you learn the subdomain in step 2; edit the app afterwards if needed)
   - Generate a client secret.
2. **Deploy the Worker** (from this folder):
   ```powershell
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put GITHUB_CLIENT_SECRET   # paste the secret
   ```
   Put the OAuth app's **Client ID** in `wrangler.toml` (`GITHUB_CLIENT_ID`) and
   redeploy. Never commit the client secret.
3. **Point the editor at it** — set `authUrl` in
   `src/pages/admin/index.astro` to the Worker URL, commit, push.
4. **Add Angela** — repo Settings → Collaborators → Write. She logs in at
   `/admin` with her own GitHub account.

## Notes

- The OAuth scope is `public_repo` (repo is public). Anyone who logs in needs
  write access to the repo; others can authenticate but the editor tells them they can't publish.
- OAuth is restricted to `https://garden.shymoose.com`: test GitHub login on the
  deployed `/admin/` page, not localhost.
