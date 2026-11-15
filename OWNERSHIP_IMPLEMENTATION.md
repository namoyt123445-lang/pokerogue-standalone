# Permanent ownership inside the existing PokéRogue game

This is an integration into the original Phaser game, not a replacement battle engine or a second game.

## First integrated increment

- Standalone mode uses the original Phaser starter-selection screen for one initial starter choice, then up to six real owned individuals for future runs.
- Pokémon use a UUID ownership ID separate from the native numeric battle ID. `PokemonData` serializes that ID so resumed runs remain linked to the same individual.
- Native successful-capture and mystery-encounter obtain paths commit an individual before party handling. If the team has six members, the capture goes straight to PC with a native text message, without any replacement/release prompt.
- Party snapshots are copied at native save and game-over boundaries. Removing a companion from a run never automatically deletes the owned record.
- New Game retains the original mode-selection flow, followed by native starter selection and save-slot selection. There is no floating PC/HOME button during gameplay.
- Selection uses the original grid, party column, summary widgets, keyboard controls, option menus, and confirmation dialog. No HTML replacement panel, scene pause, or separate keyboard interception is used. Grid entries represent individuals, including duplicate species. The BOX control filters existing collection locations; individual summaries show actual moves and IVs. Favorites and basic filters/sorting are available. Advanced organization, drag-and-drop, renaming, transfers, and collection export are not exposed by this repaired UI.
- Newly generated starters receive usable native movesets. Empty movesets from the former custom path are repaired during restoration without changing identity, level, experience, or IVs.
- Captures award family candy and Stardust. Deliberate professor transfers award family candy. Currency spending/upgrades are not included in this increment.
- IndexedDB read/write transactions serialize collection changes across tabs. Invalid operations abort instead of committing partial transfers.
- Existing local run and system saves are not overwritten or erased by migration. Resume an existing run and reach a save boundary to register its party.

## Current boundaries

- Local persistence only in this increment; separate-account cloud storage and authentication are still pending.
- Battles remain client-side, as in the existing standalone game. Server-authoritative battles and anti-cheat are not claimed.
- Box access, organization, and deliberate releases are restricted to New Game setup. Calls from battle phases are rejected. In-progress native parties cannot be swapped with boxed Pokémon.
- Native battle mechanics, evolution, Mega forms, items, abilities, modes, dex, sprites, and battle summaries are reused, including their existing supported/unimplemented mechanics.
- Daily Run is hidden in standalone ownership mode: its official-server seed and generated loan team do not fit the offline, owned-team-only flow. Classic and unlocked endless/challenge modes keep their native mode selection before party setup.
- Held modifiers and run-only boosts remain native run state. They are not promoted to permanent inventory by this increment. Mega/primal/Gmax forms are reset on new-run restoration, not treated as permanent new identities.
- Candy spending, Stardust power-ups, XL Candy, expanded HOME features, quests/events, additional exploration abilities, and account/database migrations remain later phases.
- Clearing site data deletes the collection. Do not clear site data to refresh an update. Native run-save exports are not complete collection backups.

## Tests

```sh
node --test scripts/test-ownership.mjs scripts/test-native-selection.mjs
pnpm exec vitest run test/tests/ui/owned-starter-native.test.ts
pnpm exec tsc --noEmit
pnpm build:standalone
pnpm test:standalone
```

Code modifications retain the upstream AGPL-3.0-only licensing. Original game art and Pokémon intellectual property have their own rights and attribution requirements. This does not claim Nintendo authorization.
