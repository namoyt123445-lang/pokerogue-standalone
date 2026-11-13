import { audioManager } from "#app/global-audio-manager";
import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { activeOverrides } from "#app/overrides";
import { Phase } from "#app/phase";
import { SpeciesFormChangeMoveLearnedTrigger } from "#data/form-change-triggers";
import { Gender } from "#data/gender";
import { ChallengeType } from "#enums/challenge-type";
import { UiMode } from "#enums/ui-mode";
import { overrideHeldItems, overrideModifiers } from "#modifiers/modifier";
import type { Starter } from "#types/save-data";
import { SaveSlotUiMode } from "#ui/save-slot-select-ui-handler";
import { applyChallenges } from "#utils/challenge-utils";
import { chooseOwnedTeam, takePreparedTeam, type TeamSelection } from "../fan/collection-ui";
import { individualOwnershipEnabled, preserveParty, restoreCompanion } from "../fan/ownership";
import { collectionTransaction } from "../fan/ownership-store";
import { SpeciesId } from "#enums/species-id";

export class SelectStarterPhase extends Phase {
  public readonly phaseName = "SelectStarterPhase";
  start() {
    super.start();

    audioManager.playBgm("menu");

    if (individualOwnershipEnabled) {
      // Existing session saves are imported only when they are actually resumed/saved.
      // New runs choose real owned individuals, never dex-unlocked species.
      const prepared = takePreparedTeam();
      (prepared ? Promise.resolve(prepared) : chooseOwnedTeam())
        .then(selection => {
          if (!selection) {
            globalScene.phaseManager.toTitleScreen();
            this.end();
            return;
          }
          globalScene.ui.clearText();
          globalScene.ui.setMode(UiMode.SAVE_SLOT, SaveSlotUiMode.SAVE, (slotId: number) => {
            if (slotId === -1) {
              globalScene.phaseManager.toTitleScreen();
              this.end();
              return;
            }
            globalScene.sessionSlotId = slotId;
            this.initOwnedBattle(selection).catch(error => {
              window.alert(`Your collection could not be saved. The run was not started: ${(error as Error).message}`);
              globalScene.phaseManager.toTitleScreen();
              this.end();
            });
          });
        })
        .catch(error => {
          window.alert(`Collection unavailable: ${(error as Error).message}. Existing saves have not been erased.`);
          globalScene.phaseManager.toTitleScreen();
          this.end();
        });
      return;
    }

    globalScene.ui.setMode(UiMode.STARTER_SELECT, (starters: Starter[]) => {
      globalScene.ui.clearText();
      globalScene.ui.setMode(UiMode.SAVE_SLOT, SaveSlotUiMode.SAVE, (slotId: number) => {
        // If clicking cancel, back out to title screen
        if (slotId === -1) {
          globalScene.phaseManager.toTitleScreen();
          this.end();
          return;
        }
        globalScene.sessionSlotId = slotId;
        this.initBattle(starters);
      });
    });
  }

  private async initOwnedBattle(selection: TeamSelection): Promise<void> {
    const party = globalScene.getPlayerParty();
    if ("starter" in selection) {
      const save = await collectionTransaction();
      if (save.starterChosen || save.records.length)
        throw new Error("A starter has already been chosen. Return and select an owned companion.");
      const pokemon = globalScene.addPlayerPokemon(
        speciesDataRegistry.getSpecies(selection.starter as SpeciesId),
        globalScene.gameMode.getStartingLevel(),
      );
      pokemon.setVisible(false);
      party.push(pokemon);
    } else {
      const save = await collectionTransaction();
      const records = selection.records.map(record => save.records.find(current => current.id === record.id));
      if (!records.length || records.length > 6 || records.some(record => !record))
        throw new Error("Your selected team changed. Choose again.");
      party.push(...records.map(record => restoreCompanion(record!)));
    }
    // Commit individual identities before entering the native battle loop.
    await preserveParty(party, true, "starter" in selection);
    await Promise.all(party.map(pokemon => pokemon.loadAssets()));
    this.beginNativeAdventure();
  }

  /**
   * Initialize starters before starting the first battle
   * @param starters - Array of {@linkcode Starter}s with which to start the battle
   */
  initBattle(starters: Starter[]) {
    const party = globalScene.getPlayerParty();
    const loadPokemonAssets: Promise<void>[] = [];
    starters.forEach((starter: Starter, i: number) => {
      if (!i && activeOverrides.STARTER_SPECIES_OVERRIDE) {
        starter.speciesId = activeOverrides.STARTER_SPECIES_OVERRIDE;
      }
      const species = speciesDataRegistry.getSpecies(starter.speciesId);
      let starterFormIndex = starter.formIndex;
      if (
        starter.speciesId in activeOverrides.STARTER_FORM_OVERRIDES
        && activeOverrides.STARTER_FORM_OVERRIDES[starter.speciesId] != null
        && species.forms[activeOverrides.STARTER_FORM_OVERRIDES[starter.speciesId]!]
      ) {
        starterFormIndex = activeOverrides.STARTER_FORM_OVERRIDES[starter.speciesId]!;
      }

      let starterGender =
        species.malePercent === null ? Gender.GENDERLESS : starter.female ? Gender.FEMALE : Gender.MALE;
      if (activeOverrides.GENDER_OVERRIDE !== null) {
        starterGender = activeOverrides.GENDER_OVERRIDE;
      }
      const starterPokemon = globalScene.addPlayerPokemon(
        species,
        globalScene.gameMode.getStartingLevel(),
        starter.abilityIndex,
        starterFormIndex,
        starterGender,
        starter.shiny,
        starter.variant,
        starter.ivs,
        starter.nature,
      );
      if (starter.moveset) {
        starterPokemon.tryPopulateMoveset(starter.moveset);
      }
      if (starter.passive) {
        starterPokemon.passive = true;
      }
      starterPokemon.luck = globalScene.gameData.getDexAttrLuck(
        globalScene.gameData.dexData[species.speciesId].caughtAttr,
      );
      if (starter.pokerus) {
        starterPokemon.pokerus = true;
      }

      if (starter.nickname) {
        starterPokemon.nickname = starter.nickname;
      }

      if (starter.teraType == null) {
        starterPokemon.teraType = starterPokemon.species.type1;
      } else {
        starterPokemon.teraType = starter.teraType;
      }

      if (globalScene.gameMode.isSplicedOnly || activeOverrides.STARTER_FUSION_OVERRIDE) {
        starterPokemon.generateFusionSpecies(true);
      }
      starterPokemon.setVisible(false);
      const chalApplied = applyChallenges(ChallengeType.STARTER_MODIFY, starterPokemon);
      party.push(starterPokemon);
      if (chalApplied) {
        // If any challenges modified the starter, it should update
        loadPokemonAssets.push(starterPokemon.updateInfo());
      }
      loadPokemonAssets.push(starterPokemon.loadAssets());
    });
    overrideModifiers();
    overrideHeldItems(party[0]);
    Promise.all(loadPokemonAssets).then(() => {
      this.beginNativeAdventure();
    });
  }

  private beginNativeAdventure(): void {
    audioManager.playBgm(undefined, true);
    if (globalScene.gameMode.isClassic) {
      globalScene.gameData.gameStats.classicSessionsPlayed++;
    } else {
      globalScene.gameData.gameStats.endlessSessionsPlayed++;
    }
    globalScene.newBattle();
    globalScene.arena.init();
    globalScene.sessionPlayTime = 0;
    globalScene.lastSavePlayTime = 0;
    // Ensures Keldeo (or any future Pokemon that have this type of form change) starts in the correct form
    globalScene.getPlayerParty().forEach(p => {
      globalScene.triggerPokemonFormChange(p, SpeciesFormChangeMoveLearnedTrigger);
    });
    this.end();
  }
}
