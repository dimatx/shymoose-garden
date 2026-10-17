# Notes CMS auth Worker

Tiny OAuth proxy that lets Sveltia CMS (`/admin`) log in with GitHub. It holds
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
3. **Point the CMS at it** — set `backend.base_url` in
   `public/admin/config.yml` to the Worker URL, commit, push.
4. **Add Angela** — repo Settings → Collaborators → Write. She logs in at
   `/admin` with her own GitHub account.

## Notes

- The OAuth scope is `public_repo` (repo is public). Anyone who logs in needs
  write access to the repo; others can authenticate but cannot save.
- OAuth is restricted to `https://garden.shymoose.com`: test GitHub login on the
  deployed `/admin/` page, not localhost. For offline local editing, Sveltia also
  supports "Work with Local Repository" in Chromium.
