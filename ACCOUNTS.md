# Fan accounts and cloud saves

The live site remains on Cloudflare Pages; no localhost is needed to play.
Code, worker, database schema, and original title artwork are in this repository.
The title retains the native PokéRogue menu and adds an Account entry, linking to
`/account.html`. The new lakeside pixel-art landscape is original generated art,
inspired by classic handheld adventure games, not a ripped game screenshot.
The presentation pass also adds matching page framing and detailed 320×180
meadow/forest battle backdrops for the starting outdoor routes. Other biomes keep
their original art; native Pokémon sprites, platforms, windows and controls are unchanged.

## Included

- Case-insensitive unique usernames, 12–128 character passwords, login and logout.
- PBKDF2-SHA256 salted password hashes (100,000 iterations); random session tokens
  stored hashed on the server. Secure, HttpOnly, SameSite=Strict session cookies.
- Same-origin mutation checks, bounded JSON bodies, parameterized SQL, account
  ownership checks, IP-based signup/login throttling, and authenticated save limits.
- Cloud snapshots of native system/run/history saves and the permanent collection.
  Device settings remain local. These client-side saves are not cheat-proof.
- Separate account collections and native saves. Guest progress is never silently
  imported or erased; copying it requires confirmation into an empty account.
- Autosave after native system/run/collection changes, plus a periodic dirty check.
  Cloud revisions reject stale overwrites. Conflicts require a deliberate choice
  on the Account page, with local/remote backups retained in account-scoped storage.
- Web Locks prevent two tabs playing the same account on one browser profile and
  stop the Account page replacing saves while a game tab is open.

## Boundaries

No email address, email recovery, Google login, password-change UI, or self-service
account deletion is included. The signup and privacy pages state these limitations.
Logging out does not erase local data; use separate browser profiles on shared
computers. Automatic sync needs an internet connection. Unsynced local progress
is retained on errors; do not clear browser data.

## Hosting

`wrangler.jsonc` binds `ACCOUNTS` to the Cloudflare D1 database. Initialize using:

```sh
node node_modules/wrangler/bin/wrangler.js d1 execute pokerogue-accounts --remote --file server/schema.sql
```

The build preparation script embeds `server/accounts.mjs` into the existing Pages
worker and adds `/api/fan/*` to its routes without changing JSON asset routing.
Never deploy `dist` without running the preparation script after a fresh build.
It can also safely refresh static presentation files on an already prepared build;
existing JSON packs are retained rather than nested or discarded.
The preview and production bindings currently use the same D1 database; sessions
remain host-scoped. Use a separate preview database before doing destructive QA.

```sh
node --test scripts/test-accounts.mjs scripts/test-cloud-client.mjs scripts/test-ownership.mjs scripts/test-native-selection.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run test/tests/ui/owned-starter-native.test.ts
```
