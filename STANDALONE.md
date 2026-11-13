# Unofficial standalone fan build

Independent deployment of PokéRogue; not the official game. Original credits and AGPL-3.0-only licensing are preserved. Assets and translations retain their individual licenses.

## Build

Use Node >=24.9 and pnpm 10.34.5.

```sh
git clone --recurse-submodules https://github.com/namoyt123445-lang/pokerogue-standalone.git
cd pokerogue-standalone
pnpm install --ignore-scripts
pnpm build:standalone
```

Deploy `dist` as static files on Cloudflare. All assets are hosted on this deployment, not loaded from official servers. The standalone API helper returns a local 503 response instead of making network requests. CSP blocks cross-origin resource requests. Saves use this origin's browser storage; export backups regularly. Online-only features are unavailable.

The build packs JSON resources into 128 files to stay below Pages' 20,000-file limit. The generated Pages `_worker.js` serves their original URLs from `ASSETS`; other files are static. JSON requests consume the account's Pages Functions request allowance. No paid plan is enabled by these scripts.

```sh
pnpm exec wrangler pages deploy dist --project-name pokerogue-standalone --branch main
```

Deployment is manual. Upstream GitHub Actions are disabled for this repository to avoid running the official game's automation.

The on-page source link provides corresponding source under the AGPL. Do not remove original license and attribution notices. `.env.standalone` contains public build settings, not secrets. Never commit Cloudflare tokens.
