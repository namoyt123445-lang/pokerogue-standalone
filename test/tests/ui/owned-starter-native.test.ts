import { SpeciesId } from "#enums/species-id";
import { MoveId } from "#enums/move-id";
import { UiMode } from "#enums/ui-mode";
import { Button } from "#enums/buttons";
import { PokemonData } from "#system/pokemon-data";
import { GameManager } from "#test/framework/game-manager";
import type { StarterSelectUiHandler } from "#ui/starter-select-ui-handler";
import { initialStarterCandidates, restoreCompanion } from "../../../src/fan/ownership";
import type { OwnedRecord, PokemonSnapshot } from "../../../src/fan/ownership-store";
import { TrainerHub } from "../../../src/fan/daycare";
import { EggGachaFeatures } from "../../../src/fan/egg-gacha-features";
import * as daycareClient from "../../../standalone-public/daycare-client.js";
import { TrainerHubUiHandler } from "../../../src/ui/handlers/trainer-hub-ui-handler";
import { LoginOrRegisterUiHandler } from "../../../src/ui/handlers/login-or-register-ui-handler";
import Phaser from "phaser";
import { beforeAll, describe, expect, it, vi } from "vitest";

describe("Native PokéRogue owned-party integration", () => {
  let phaserGame: Phaser.Game;
  beforeAll(() => { phaserGame = new Phaser.Game({type:Phaser.HEADLESS}); });
  it("uses the native grid for duplicates, enforces one starter, and repairs empty moves without replacing identity", async () => {
    const game = new GameManager(phaserGame);
    game.override.battleStyle("single").enemySpecies(SpeciesId.MAGIKARP).enemyMoveset(MoveId.SPLASH);
    await game.classicMode.startBattle(SpeciesId.BULBASAUR);
    // Exercise the real selector controller without headless texture rendering.
    const selector = Object.create(EggGachaFeatures.prototype);
    let finishOpening!: (value: boolean) => void;
    Object.assign(selector, {
      page: 1, row: 1, opening: false, destroyed: false, pages: [],
      pointer: { setY: vi.fn() }, message: vi.fn(), exit: vi.fn(),
      open: vi.fn(() => new Promise<boolean>(resolve => { finishOpening = resolve; })),
    });
    selector.processInput(Button.RIGHT);
    expect(selector.page).toBe(2);
    selector.processInput(Button.LEFT);
    expect(selector.page).toBe(1);
    selector.processInput(Button.DOWN);
    expect(selector.row).toBe(2);
    selector.processInput(Button.UP);
    expect(selector.row).toBe(1);
    selector.processInput(Button.ACTION);
    expect(selector.open).toHaveBeenCalledWith(1);
    expect(selector.processInput(Button.ACTION)).toBe(false);
    expect(selector.processInput(Button.RIGHT)).toBe(false);
    expect(selector.open).toHaveBeenCalledTimes(1);
    finishOpening(true);
    await Promise.resolve();
    selector.processInput(Button.CANCEL);
    expect(selector.exit).toHaveBeenCalledTimes(1);
    selector.row = 5;
    selector.processInput(Button.ACTION);
    expect(selector.exit).toHaveBeenCalledTimes(2);
    const original = game.scene.getPlayerParty()[0];
    const data = JSON.parse(JSON.stringify(new PokemonData(original))) as PokemonSnapshot;
    const record: OwnedRecord = {id:crypto.randomUUID(),data,family:SpeciesId.BULBASAUR,originalTrainer:"test",capturedAt:new Date().toISOString(),location:"pc",box:0,slot:0,favorite:false,locked:false};
    const duplicate: OwnedRecord = structuredClone(record); duplicate.id=crypto.randomUUID();duplicate.slot=1;
    const handler = game.scene.ui.handlers[UiMode.STARTER_SELECT] as StarterSelectUiHandler;
    const onSelected = vi.fn();
    await game.scene.ui.setMode(UiMode.STARTER_SELECT,onSelected,{records:[record,duplicate],firstStarter:false,candy:{}});
    expect(game.scene.ui.mode).toBe(UiMode.STARTER_SELECT);
    expect(handler["nativeOwnedView"].map(r=>r.id)).toEqual([record.id,duplicate.id]);
    expect(handler["starterSelectContainer"].visible).toBe(true);
    handler["nativeOwnedParty"].push(record,duplicate);
    handler["syncNativeOwnedParty"]();
    expect(handler["partyStarters"].map(s=>s.ownershipId)).toEqual([record.id,duplicate.id]);
    expect(handler["isPartyValid"]()).toBe(true);
    expect(document.querySelector("#fan-collection")).toBeNull();
    game.scene.money = 0;
    expect(handler.processInput(Button.SUBMIT)).toBe(true);
    await vi.waitUntil(()=>game.scene.ui.mode===UiMode.CONFIRM,{timeout:3000});
    game.scene.ui.getHandler().processInput(Button.ACTION);
    await vi.waitUntil(()=>onSelected.mock.calls.length===1,{timeout:3000});
    expect(onSelected.mock.calls[0][0].map((s:{ownershipId:string})=>s.ownershipId)).toEqual([record.id,duplicate.id]);
    expect(game.scene.money).toBe(game.scene.gameMode.getStartingMoney());
    handler.clear();

    const candidates = initialStarterCandidates();
    expect(candidates.map(c=>c.data.species)).toEqual([SpeciesId.BULBASAUR,SpeciesId.CHARMANDER,SpeciesId.SQUIRTLE]);
    for(const candidate of candidates) expect(new PokemonData(candidate.data).moveset.length).toBeGreaterThan(0);
    handler.show([vi.fn(),{records:candidates,firstStarter:true,candy:{}}]);
    handler["nativeOwnedParty"].push(...candidates.slice(0,2));
    expect(handler["isPartyValid"]()).toBe(false);
    handler["nativeOwnedParty"].pop();
    expect(handler["isPartyValid"]()).toBe(true);
    handler.clear();

    const broken = structuredClone(record); broken.data.moveset=[];
    const repaired = restoreCompanion(broken);
    expect(repaired.ownershipId).toBe(record.id);
    expect(repaired.ivs).toEqual(data.ivs);
    expect(repaired.level).toBe(data.level);
    expect(repaired.moveset.length).toBeGreaterThan(0);
    repaired.destroy();
    const blueprint = structuredClone(record);
    blueprint.id=crypto.randomUUID();
    blueprint.data={...blueprint.data,ownershipId:blueprint.id,daycareBlueprint:true,level:5,exp:0,moveset:[],stats:[],ivs:[1,2,3,4,5,6]};
    game.override.playerIVs(null);
    const child=restoreCompanion(blueprint);
    expect(child.ownershipId).toBe(blueprint.id);
    expect(child.id).toBe(blueprint.data.id);
    expect(child.level).toBe(5);
    expect(child.ivs).toEqual([1,2,3,4,5,6]);
    expect(child.moveset.length).toBeGreaterThan(0);
    expect(child.getMaxHp()).toBeGreaterThan(0);
    expect(blueprint.data.stats).toEqual([]);
    child.destroy();

    vi.spyOn(daycareClient,"getDaycareStatus").mockReturnValue({
      state:{gems:30,slots:1,eggs:[],legendaryNextAt:0,daily:{battles:0},totalBattles:0},
      rules:{slotPrices:[25]},
      parents:[
        {id:record.id,name:"Bulbasaur",level:5,shiny:false,data:{species:1,gender:1}},
        {id:duplicate.id,name:"Bulbasaur",level:5,shiny:false,data:{species:1,gender:0}},
      ],
      quests:[{id:"victories-10",name:"Finding your stride",description:"Win 10 battles",progress:0,goal:10,gems:10,claimed:false}],
    });
    // Headless fixture has no texture uploader; verify menu behavior separately.
    const artwork={render:vi.fn(),destroy:vi.fn()};
    game.scene.ui.handlers[UiMode.TRAINER_HUB]=new TrainerHubUiHandler(()=>artwork);
    const catalog={1:{id:1,name:"Bulbasaur",groups:[1],root:1,legendary:false}};
    const hub=new TrainerHub(catalog,[record,duplicate]);
    hub.open();
    await vi.waitUntil(()=>game.scene.ui.mode===UiMode.TRAINER_HUB);
    const hubHandler=game.scene.ui.getHandler();
    // Opens directly into Daycare: no Trainer Hub landing page.
    expect(artwork.render.mock.lastCall?.[0].title).toBe("Daycare Nursery");
    expect(hubHandler.processInput(Button.RIGHT)).toBe(true);
    expect(hub["tab"]).toBe(2);
    expect(hubHandler.processInput(Button.LEFT)).toBe(true);
    expect(hub["tab"]).toBe(1);
    expect(artwork.render.mock.calls.some(call=>call[0].title==="Breeding Center")).toBe(true);
    hubHandler.processInput(Button.RIGHT);
    hubHandler.processInput(Button.RIGHT);
    expect(artwork.render.mock.lastCall?.[0].title).toBe("Quest Board");
    artwork.render.mock.lastCall?.[2](0); // Open quest details.
    expect(artwork.render.mock.lastCall?.[0].title).toBe("Finding your stride");
    expect(artwork.render.mock.lastCall?.[0].cards[0].disabled).toBe(true);
    hubHandler.processInput(Button.CANCEL);
    hubHandler.processInput(Button.LEFT); // Directly to Breeding.
    artwork.render.mock.lastCall?.[2](0); // Choose parents.
    artwork.render.mock.lastCall?.[2](0); // First individual.
    expect(artwork.render.mock.lastCall?.[0].title).toBe("Choose a partner");
    artwork.render.mock.lastCall?.[2](0); // Second individual.
    expect(artwork.render.mock.lastCall?.[0].title).toBe("Bulbasaur egg");
    expect(artwork.render.mock.lastCall?.[0].hero).toHaveLength(3);
    expect(artwork.render.mock.lastCall?.[0].cards[0].details).toContain("Cost: 5 Gems");
    expect(artwork.render.mock.calls.some(call=>call[0].title==="Trainer Hub")).toBe(false);
    expect(document.querySelector("iframe")).toBeNull();
    game.scene.ui.revertMode();
    vi.stubEnv("MODE","standalone");
    try {
      expect(new LoginOrRegisterUiHandler().getButtonLabels()).toHaveLength(3);
      expect(new LoginOrRegisterUiHandler().getButtonLabels()).toContain("Guest");
    } finally { vi.unstubAllEnvs(); }
  });
});
