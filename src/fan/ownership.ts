import { globalScene } from "#app/global-scene";
import { PokemonData } from "#system/pokemon-data";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import type { Pokemon, PlayerPokemon } from "#field/pokemon";
import { collectionTransaction, firstFree, type OwnedRecord, type PokemonSnapshot } from "./ownership-store";

export const individualOwnershipEnabled = import.meta.env.MODE === "standalone";
function snapshot(pokemon: Pokemon): PokemonSnapshot {
  const raw = JSON.parse(JSON.stringify(new PokemonData(pokemon))) as PokemonSnapshot;
  raw.player = true;
  raw.ownershipId = pokemon.ownershipId;
  return raw;
}
/** Called before the native capture/release prompt: every successful capture is kept. */
export async function preserveCapture(pokemon: Pokemon, ball?: number): Promise<void> {
  if (!individualOwnershipEnabled) return;
  const id = pokemon.ownershipId ?? crypto.randomUUID();
  const data = snapshot(pokemon);
  data.ownershipId = id;
  if (ball !== undefined) data.pokeball = ball;
  data.metLevel = pokemon.level;
  data.metBiome = globalScene.arena.biomeId;
  data.metWave = globalScene.currentBattle.waveIndex;
  data.metSpecies = pokemon.species.speciesId;
  const family = pokemon.species.getRootSpeciesId(true);
  await collectionTransaction(save => {
    if (save.records.some(record => record.id === id)) return;
    save.records.push({ id, data, family, originalTrainer: `${globalScene.gameData.trainerId}`, capturedAt: new Date().toISOString(), location: "pc", ...firstFree(save, "pc"), favorite: false, locked: false });
    save.candy[family] = (save.candy[family] ?? 0) + (pokemon.shiny ? 6 : 3);
    save.stardust += pokemon.shiny ? 300 : 100;
  });
  pokemon.ownershipId = id;
}
/** Copy native progression at save boundaries without deleting released/fainted individuals. */
export async function preserveParty(party: PlayerPokemon[], initialStarter = false, requireEmpty = false): Promise<void> {
  if (!individualOwnershipEnabled || party.length === 0) return;
  const entries = party.map(pokemon => {
    const id = pokemon.ownershipId ?? crypto.randomUUID();
    return { pokemon, id, data: { ...snapshot(pokemon), ownershipId: id }, family: pokemon.species.getRootSpeciesId(true) };
  });
  await collectionTransaction(save => {
    if (requireEmpty && (save.starterChosen || save.records.length)) throw new Error("Your starter was already selected in another tab. Return to the title and choose your owned team.");
    for (const record of save.records.filter(r => r.location === "party")) Object.assign(record, { location: "pc", ...firstFree(save, "pc") });
    for (let slot = 0; slot < entries.length; slot++) {
      const { id, data, family } = entries[slot];
      let record = save.records.find(r => r.id === id);
      if (!record) {
        record = { id, data, family, originalTrainer: `${globalScene.gameData.trainerId}`, capturedAt: new Date().toISOString(), location: "party", box: 0, slot, favorite: false, locked: false };
        save.records.push(record);
      }
      record.data = data;
      Object.assign(record, { location: "party", box: 0, slot });
    }
    if (initialStarter || save.records.length) save.starterChosen = true;
  });
  entries.forEach(({ pokemon, id }) => { pokemon.ownershipId = id; });
}
/** Native PokemonData reconstruction retains IVs, moves, ability, nature, ID and level. */
export function restoreCompanion(record: OwnedRecord): PlayerPokemon {
  const raw = structuredClone(record.data);
  raw.player = true;
  raw.ownershipId = record.id;
  // Temporary battle overrides and transformations must not leak into a new run.
  raw.summonData = {};
  raw.battleData = {};
  raw.isTerastallized = false;
  raw.boss = false;
  const formKey = speciesDataRegistry.getSpecies(raw.species).forms[raw.formIndex]?.formKey ?? "";
  if (["mega", "primal", "gmax", "gigantamax"].some(key => formKey.includes(key))) raw.formIndex = 0;
  const pokemon = new PokemonData(raw).toPokemon() as PlayerPokemon;
  pokemon.ownershipId = record.id;
  pokemon.hp = pokemon.getMaxHp();
  pokemon.status = null;
  pokemon.moveset.forEach(move => { move.ppUsed = 0; });
  pokemon.setVisible(false);
  return pokemon;
}
