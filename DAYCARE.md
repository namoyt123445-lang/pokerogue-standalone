# First playable Daycare increment (priorities 1–5)

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
