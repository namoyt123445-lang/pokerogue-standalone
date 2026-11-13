# Permanent ownership inside the existing PokéRogue game

This is an integration into the original Phaser game, not a replacement battle engine or a second game.

## First integrated increment

- Standalone mode replaces the native starter-unlock screen with one initial starter choice, then selects up to six real owned individuals for future runs.
- Pokémon use a UUID ownership ID separate from the native numeric battle ID. `PokemonData` serializes that ID so resumed runs remain linked to the same individual.
- Native successful-capture and mystery-encounter obtain paths commit an individual before native full-party/release prompts. Declining to add a capture to the current party keeps it in PC storage.
- Party snapshots are copied at native save and game-over boundaries. Removing a companion from a run never automatically deletes the owned record.
- The PC/HOME button opens a panel on top of the same game. Native input is suspended while it is open. It offers individual summaries, PC/HOME/party slots, transactional swaps, drag and drop, favorites, transfer locks, search, sorting, automatic capture-box expansion, renaming, and export.
- Captures award family candy and Stardust. Deliberate professor transfers award family candy. Currency spending/upgrades are not included in this increment.
- IndexedDB read/write transactions serialize collection changes across tabs. Invalid operations abort instead of committing partial transfers.
- Existing local run and system saves are not overwritten or erased by migration. Resume an existing run and reach a save boundary to register its party.

## Current boundaries

- Local persistence only in this increment; separate-account cloud storage and authentication are still pending.
- Battles remain client-side, as in the existing standalone game. Server-authoritative battles and anti-cheat are not claimed.
- Storage organization and deliberate releases are restricted to the title/team-selection phase. In-progress native parties are not silently replaced from a browser overlay.
- Native battle mechanics, evolution, Mega forms, items, abilities, modes, dex, sprites, and battle summaries are reused, including their existing supported/unimplemented mechanics.
- Held modifiers and run-only boosts remain native run state. They are not promoted to permanent inventory by this increment. Mega/primal/Gmax forms are reset on new-run restoration, not treated as permanent new identities.
- Candy spending, Stardust power-ups, XL Candy, expanded HOME features, quests/events, additional exploration abilities, and account/database migrations remain later phases.
- Clearing site data deletes the collection. Export backups using PC/HOME; the collection export is separate from the native run-save export.

## Tests

```sh
node --test scripts/test-ownership.mjs
pnpm exec tsc --noEmit
pnpm build:standalone
pnpm test:standalone
```

Code modifications retain the upstream AGPL-3.0-only licensing. Original game art and Pokémon intellectual property have their own rights and attribution requirements. This does not claim Nintendo authorization.
