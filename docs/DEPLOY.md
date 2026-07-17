# Deploying to Cloudflare Pages (game.p42.uk)

The app is a **static Vite SPA** — no server code. Cloudflare Pages serves the built
`dist/` folder directly. No code rewrite is needed; `public/_redirects` provides SPA
fallback and `wrangler.jsonc` sets the Pages project name and output dir.

## One-time: credentials

Deployment needs a **Cloudflare API token** with these permissions on the `p42.uk` account:

- **Account → Cloudflare Pages → Edit** (create project + deploy)
- **Zone → DNS → Edit** for the `p42.uk` zone (add the `game` custom-domain record)

Create it at *Cloudflare dashboard → My Profile → API Tokens → Create Token*, then export it:

```bash
export CLOUDFLARE_API_TOKEN="<token>"      # bash
$env:CLOUDFLARE_API_TOKEN = "<token>"      # PowerShell
```

Verify: `npx wrangler whoami`

## First deploy

```bash
# 1. Create the Pages project (once)
npx wrangler pages project create monster-tamer --production-branch main

# 2. Build + deploy
npm run deploy            # = npm run build && wrangler pages deploy
```

This publishes to `https://monster-tamer.pages.dev`.

## Custom domain (game.p42.uk)

```bash
npx wrangler pages domain add monster-tamer game.p42.uk
```

This adds the domain to the project and creates the `CNAME game → monster-tamer.pages.dev`
DNS record on the `p42.uk` zone (proxied). SSL provisions automatically in a few minutes.

## Continuous deploys (optional)

Alternatively, connect the GitHub repo (`42p-personal/GAME`) in the Pages dashboard with
build command `npm run build` and output dir `dist` — every push to `main` then auto-deploys.
