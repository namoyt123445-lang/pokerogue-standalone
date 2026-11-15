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
import { individualOwnershipEnabled, initialStarterCandidates, preserveParty, restoreCompanion } from "../fan/ownership";
import { collectionTransaction } from "../fan/ownership-store";
import { validateNativeTeam, type NativeOwnedSelection } from "../fan/native-selection";

export class SelectStarterPhase extends Phase {
  public readonly phaseName = "SelectStarterPhase";
  start() {
    super.start();

    audioManager.playBgm("menu");

    if (individualOwnershipEnabled) {
      void this.showNativeOwnedSelection();
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

  private async showNativeOwnedSelection(): Promise<void> {
    try {
      const save = await collectionTransaction();
      const firstStarter = !save.starterChosen && save.records.length === 0;
      const context: NativeOwnedSelection = { records: firstStarter ? initialStarterCandidates() : save.records, firstStarter, candy: save.candy };
      globalScene.ui.setMode(
        UiMode.STARTER_SELECT,
        (starters: Starter[]) => {
          const ids = starters.map(starter => starter.ownershipId ?? "");
          validateNativeTeam(context.records, ids, firstStarter);
          globalScene.ui.clearText();
          globalScene.ui.setMode(UiMode.SAVE_SLOT, SaveSlotUiMode.SAVE, (slotId: number) => {
            if (slotId === -1) { globalScene.phaseManager.toTitleScreen(); this.end(); return; }
            globalScene.sessionSlotId = slotId;
            void this.initOwnedBattle(context, ids).catch(error => this.ownershipError(error));
          });
        },
        context,
      );
    } catch (error) { this.ownershipError(error); }
  }

  private ownershipError(error: unknown): void {
    console.error("Permanent team could not be loaded", error);
    globalScene.ui.setMode(UiMode.MESSAGE);
    globalScene.ui.showText(`Could not load your collection. Your saves have not been erased.\n${(error as Error).message}`, null, () => {
      globalScene.phaseManager.toTitleScreen(); this.end();
    }, 0, true);
  }

  private async initOwnedBattle(context: NativeOwnedSelection, ids: string[]): Promise<void> {
    const save = await collectionTransaction();
    const records = validateNativeTeam(context.firstStarter ? context.records : save.records, ids, context.firstStarter);
    const party = globalScene.getPlayerParty();
    if (party.length) throw new Error("A previous party is still active. Return to the title before starting a new run.");
    party.push(...records.map(restoreCompanion));
    await preserveParty(party, true, context.firstStarter);
    overrideModifiers();
    overrideHeldItems(party[0]);
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
