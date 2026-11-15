# First playable Daycare increment (priorities 1–5)

## Native hub rebuild

The latest revision uses a dedicated native UI mode, not a text option menu.
There is **no Trainer Hub landing page**. Egg Gacha uses its original machines,
voucher pulls, navigation and layout. Added features are separate ordinary text
entries in the native title/menu: Boxes, Daycare, Breeding, Quests and Gem Rewards.
Cloudflare hosting and account cloud saves remain enabled. No save migration or
data reset is needed for this menu change.
Artwork
uses actual existing Pokémon portrait, egg, map and Gem item atlases, plus the
credited non-commercial Day-Care tile by PkmnAlexandrite/Maxewenx. Rejected
code-drawn icons and generated facility illustrations are not shipped.
Pokémon cards
show native 2D Pokémon portraits and individual details; nursery cards show egg
progress and hatching details; breeding has parent portraits and a confirmation
screen; quests have objective/reward pages; Gems have claim/detail pages.
Pointer, keyboard and gamepad controls share the same actions. Actions are
disabled while saving, and failed network mutations retain their request UUID
for retry. Unsupported/missing sprites fall back to the egg illustration.

Standalone authentication now reuses PokéRogue's native login/register windows,
with a Guest option. Login/register call the same existing account API and reload
the same game URL to safely initialize the selected account. Account backups,
guest import, cloud-conflict choices and logout are native game dialogs.
`/account.html` is now a compatibility redirect to `/`; no separate login page.

Local graphical revision: the hub now has original pixel-sprite tabs (PC, nursery,
egg, quest scroll and Gem), a native full-screen window, selection highlights and
clickable tabs/arrows. Left/right keyboard navigation is retained.

To test without publishing: build the standalone output, then run `pnpm start:local`
and open `http://127.0.0.1:8000`. Local test accounts/saves live only in ignored
`.local-test/accounts.sqlite`; use a separate test account. The local server
never connects to production D1 or proxies live login sessions.

The standalone Daycare page now redirects to the game. Breeding Center opens a
native pixel-window hub on the title screen. Left/right changes tabs: Pokémon
Boxes (owned-individual browser), Daycare, Breeding, Quests and Gems/Rewards.
Up/down selects rows, confirm activates, cancel closes. Existing eggs remain
accessible in Daycare; Egg Gacha is no longer offered in standalone menus.
Vouchers and legacy egg data are retained, not deleted or converted.

Trial one-time quests: own 5 Pokémon (+10 Gems), own 15 (+20), win 10 battles
(+10), win 50 (+20), hatch one Daycare egg (+10). Collection quests count current
owned individuals including starters and offspring, not a separate historical
capture total. Server progress validation and claim receipts prevent repeat
payouts. These initial quests are intentionally simple for user approval.

## Included

1. **Save protection:** additive D1 tables, three previous server save revisions,
   an Account-page backup download, and permanent hatched-Pokémon grant records.
   A stale save restore cannot delete a server-hatched individual. Existing native
   eggs, vouchers, run saves, Pokémon and their identities are not converted or erased.
2. **Permanent Gems:** 30 welcome Gems once; 10 daily Gems on a rolling 24-hour
   timer; 2 Gems per 10 reported victories for the first 200 in each daily window;
   a claimable 10-Gem task after 20 victories. No purchases or real-money payments.
3. **Daycare:** one free slot, up to six. Extra slots cost 25, 50, 75, 100 and
   125 Gems and remain unlocked. All incubating eggs progress in parallel.
4. **Breeding Center:** replaces the standalone Egg Gacha menu label, with the
   legacy Gacha/vouchers and existing-egg list retained in a native submenu.
   Full management opens from the title screen only; it never swaps an active party.
   The dedicated responsive `/daycare.html` page offers individual parent selectors,
   previews, portraits, confirmations, egg cards, activity, and server-time countdowns.
5. **Legendary breeding:** an already-owned legendary/mythical plus Ditto produces
   one egg per account per 86,400,000 ms. Shared across all slots and devices,
   starting at successful egg creation. Neither changing the computer clock nor
   restoring native game saves resets it. A small native HUD shows Gems and time.

Normal eggs cost 5 Gems and need 10 victories; legendary eggs cost 25 Gems and
need 40 victories. Both parents remain unchanged and unconsumed. Hatching places
a new UUID individual in PC, not the active party. The native engine materializes
its level-5 stats and moves; it never copies the parents' trained stats.

Breeding uses checked-in, attributed PokéAPI metadata for national species
1–1025: shared egg groups/opposite genders, or a compatible non-Ditto with Ditto.
Undiscovered ordinary species and Ditto/Ditto pairs are blocked. The legendary/
mythical Ditto exception is a deliberate fan-game rule. Normal offspring are the
mother/non-Ditto parent's evolution root; legendary offspring keep that legendary's
species. Base forms and standard ability only; three distinct IVs are inherited,
other IVs and nature are rolled, shiny chance is 1/512. Regional/custom species,
fusion breeding, egg-move inheritance and special item/incense rules are not
included in this increment and are not advertised as implemented.

## Server integrity and limitations

Financial state lives in `daycare_states`, not the editable game snapshot.
Mutations check the account, optimistic revision and request UUID. D1 batches
use constraint guards so state, payment, cooldown, grant, backup and cloud-save
updates either commit together or roll back. Repeating a successful request ID
does not charge again. Victory IDs are unique per account/run-seed/wave; offline
reports are retained locally and retried using the same request UUID.

Battles remain client-side. Victory reports are deduplicated and Gem rewards
capped, but this is not server-authoritative or cheat-proof gameplay.
Gems/Daycare require an account and internet access. Native guest gameplay remains
available. Breeding does not require a quest, and normal legendary encounters
are unchanged. No biome quests, Urshifu quest, Mew cloning or research were added.
Existing Gacha eggs continue their native behavior and do not occupy new slots.

## Deployment and tests

Apply the additive schema before publishing the worker:

```sh
node node_modules/wrangler/bin/wrangler.js d1 execute pokerogue-accounts --remote --file server/schema.sql
node --test scripts/test-daycare.mjs scripts/test-daycare-client.mjs scripts/test-accounts.mjs scripts/test-cloud-client.mjs
node node_modules/vitest/vitest.mjs run test/tests/ui/owned-starter-native.test.ts test/tests/ui/hd-background.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

`server/species-breeding.json` and its pinned source attribution are checked in.
`scripts/build-breeding-catalog.mjs` is an optional regeneration tool; normal
builds make no requests to external Pokémon APIs.
