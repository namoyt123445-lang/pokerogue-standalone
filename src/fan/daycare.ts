import { globalScene } from "#app/global-scene";
import { TextStyle } from "#enums/text-style";
import { addTextObject } from "#ui/text";
import { getAccountUser, syncCloud, api, writeSnapshot } from "../../standalone-public/cloud.js";
import { daycareServerNow, getDaycareStatus, startDaycareSync, refreshDaycare, daycareAction, flushDaycareBattles } from "../../standalone-public/daycare-client.js";
import { formatDaycareTime } from "../../standalone-public/breeding-rules.js";
import { canManageCollectionAtPhase } from "./ownership-store";
import { UiMode } from "#enums/ui-mode";
import type { OptionSelectItem, OptionSelectModeConfig } from "#types/ui-types";
import { materializeDaycareCollection } from "./ownership";
import { TrainerHubArt } from "./trainer-hub-art";

const installed = new WeakSet<object>();
export function installDaycareStatus(): void {
  if (import.meta.env.MODE !== "standalone" || installed.has(globalScene.ui)) return;
  installed.add(globalScene.ui);
  startDaycareSync();
  const { width, height } = globalScene.scaledCanvas;
  const label = addTextObject(width / 2, -height + 1, "", TextStyle.MESSAGE, { fontSize: "30px" }).setOrigin(0.5, 0);
  globalScene.ui.add(label);
  globalScene.time.addEvent({ delay: 1000, loop: true, callback: () => {
    const data = getDaycareStatus();
    label.setVisible(!!getAccountUser() && !!data);
    if (!data) return;
    const remaining = Math.max(0, data.state.legendaryNextAt - daycareServerNow());
    label.setText(`Gems: ${data.state.gems} | Legendary: ${remaining ? formatDaycareTime(remaining) : "Ready"}`);
  } });
}
export function openDaycare(): boolean {
  const phase = globalScene.phaseManager.getCurrentPhase().phaseName;
  if (!canManageCollectionAtPhase(phase)) {
    globalScene.ui.showText("Visit the Breeding Center from the title screen after saving and quitting your run.", null, () => globalScene.ui.showText(""), 1500);
    return false;
  }
  void syncCloud().then(async () => {
    if (!getAccountUser()) {
      globalScene.ui.showText("Log in through Account to use the Trainer Hub.");
      return;
    }
    await refreshDaycare();
    await flushDaycareBattles();
    const { catalog } = await api("daycare/catalog");
    new TrainerHub(catalog).open();
  }).catch(error => {
    console.error(error);
    globalScene.ui.showText("Cloud sync needs attention. Open Account before visiting the Daycare; your local progress is safe.");
  });
  return true;
}

/** Native window/cursor/text controls: no DOM overlay or external navigation. */
interface HubArtwork { draw(tab: number): void; destroy(): void }
export class TrainerHub {
  private tab = 1;
  private art: HubArtwork | null = null;
  private busy = false;
  private notice = "";
  private readonly tabs = ["Pokémon Boxes", "Daycare", "Breeding", "Quests", "Gems / Rewards"];
  constructor(private catalog: Record<string, { name: string }>,
    private createArt: (navigate: (tab: number) => void) => HubArtwork = navigate => new TrainerHubArt(navigate)) {}

  private item(label: string, action: () => void): OptionSelectItem {
    return { label, keepOpen: true, handler: () => { if (!this.busy) action(); return true; } };
  }
  private heading(label: string): OptionSelectItem { return { label, selectable: false, handler: () => false }; }
  open(): void {
    this.art = this.createArt(tab => {
      if (this.busy) return;
      this.tab = tab; this.notice = ""; this.show();
    });
    this.art.draw(this.tab);
    globalScene.ui.setOverlayMode(UiMode.OPTION_SELECT, this.config());
  }
  private show(options?: OptionSelectItem[]): void {
    this.art?.draw(this.tab);
    const handler = globalScene.ui.getHandler();
    handler.clear();
    handler.show([options ? { options, maxOptions: 5 } : this.config()]);
  }
  private async run(action: () => Promise<unknown>): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.notice = "Saving...";
    this.show();
    try { await action(); this.notice = "Saved!"; }
    catch (error) {
      this.notice = error instanceof Error ? error.message : "Please try again.";
      try { await refreshDaycare(); } catch { /* Keep the last known state. */ }
    } finally { this.busy = false; this.show(); }
  }
  private confirm(text: string, action: () => Promise<unknown>): void {
    this.show([
      this.heading(text),
      this.item("Confirm", () => { void this.run(action); }),
      this.item("Back", () => this.show()),
    ]);
  }
  private config(): OptionSelectModeConfig {
    const data = getDaycareStatus();
    const { state, rules } = data;
    const options: OptionSelectItem[] = [
      this.item(`<  ${this.tabs[this.tab]}  >`, () => { this.tab = (this.tab + 1) % this.tabs.length; this.show(); }),
      this.heading(`${state.gems} Gems | Slots ${state.eggs.length}/${state.slots}`),
    ];
    if (this.notice) options.push(this.heading(this.notice.slice(0, 68)));
    if (this.tab === 0) {
      options.push(this.heading("Your owned Pokémon (party + PC)"));
      for (const p of data.parents) options.push(this.item(`${p.name}${p.shiny ? " ★" : ""} Lv.${p.level} #${p.id.slice(0, 6)}`, () => {
        this.show([this.heading(`${p.name} | Individual #${p.id.slice(0, 8)}`),
          this.heading(`Level ${p.level} | ${p.shiny ? "Shiny" : "Standard"} | Owned permanently`),
          this.item("Back to boxes", () => this.show())]);
      }));
      if (!data.parents.length) options.push(this.heading("Choose your first starter to begin."));
    } else if (this.tab === 1) {
      const remaining = Math.max(0, state.legendaryNextAt - daycareServerNow());
      options.push(this.heading(`Legendary: ${remaining ? formatDaycareTime(remaining) : "Ready"}`));
      for (const egg of state.eggs) {
        const progress = Math.min(egg.battles, state.totalBattles - egg.createdBattle);
        options.push(this.item(`${egg.name}: ${progress}/${egg.battles} wins${progress >= egg.battles ? " - HATCH" : ""}`, () => {
          if (progress < egg.battles) { this.notice = "Win battles to help this egg hatch."; this.show(); return; }
          this.confirm(`Hatch ${egg.name} into your PC?`, async () => {
            const result = await daycareAction("hatch", { eggId: egg.id });
            await writeSnapshot(result.cloud.save, result.cloud.revision);
            await materializeDaycareCollection();
            await syncCloud();
          });
        }));
      }
      if (!state.eggs.length) options.push(this.heading("No eggs yet. Use the Breeding tab!"));
      const price = rules.slotPrices[state.slots - 1];
      if (price !== undefined) options.push(this.item(`Unlock slot ${state.slots + 1}: ${price} Gems`, () =>
        this.confirm(`Spend ${price} Gems on a permanent slot?`, () => daycareAction("slot"))));
      options.push(this.item("Existing eggs (preserved)", () => {
        if (!globalScene.gameData.eggs.length) { this.notice = "No existing legacy eggs."; this.show(); return; }
        globalScene.ui.revertMode(); globalScene.ui.setOverlayMode(UiMode.EGG_LIST);
      }));
    } else if (this.tab === 2) {
      options.push(this.heading("Parents stay yours. Babies hatch into PC."));
      options.push(this.heading("Normal: 5 Gems / 10 wins"));
      options.push(this.heading("Legendary + Ditto: 25 Gems / 40 wins"));
      options.push(this.item("Choose parents", () => this.chooseParent()));
    } else if (this.tab === 3) {
      options.push(this.heading("Trial quests - tell us what to change!"));
      for (const q of data.quests || []) options.push(this.item(
        `${q.name}: ${Math.min(q.progress, q.goal)}/${q.goal} ${q.claimed ? "[Claimed]" : `+${q.gems} Gems`}`,
        () => this.show([
          this.heading(q.description),
          this.heading(`${q.progress}/${q.goal} | Reward: ${q.gems} Gems`),
          this.item(q.claimed ? "Already claimed" : "Claim reward", () => {
            void this.run(() => daycareAction("quest", { questId: q.id }));
          }),
          this.item("Back to quests", () => this.show()),
        ])));
    } else {
      options.push(this.item("Claim daily supply: 10 Gems", () => { void this.run(() => daycareAction("daily")); }));
      options.push(this.heading(`Daily task: ${state.daily.battles}/20 victories`));
      options.push(this.item("Claim battle task: 10 Gems", () => { void this.run(() => daycareAction("task")); }));
      options.push(this.heading("Every 10 victories: +2 Gems (daily cap)"));
      options.push(this.item("Refresh progress", () => { void this.run(async () => { await flushDaycareBattles(); await refreshDaycare(); }); }));
    }
    options.push(this.item("Close", () => { this.art?.destroy(); globalScene.ui.revertMode(); }));
    return { options, maxOptions: 5, onHorizontal: direction => {
      if (this.busy) return;
      this.tab = (this.tab + direction + this.tabs.length) % this.tabs.length;
      this.notice = ""; this.show();
    } };
  }
  private chooseParent(first?: string): void {
    const parents = getDaycareStatus().parents;
    this.show([
      this.heading(first ? "Choose second parent / Ditto" : "Choose first parent"),
      ...parents.filter(p => p.id !== first).map(p => this.item(`${p.name} Lv.${p.level} #${p.id.slice(0, 6)}`, () => {
        if (!first) { this.chooseParent(p.id); return; }
        void this.preview(first, p.id);
      })),
      this.item("Back", () => this.show()),
    ]);
  }
  private async preview(parentA: string, parentB: string): Promise<void> {
    const { planBreeding } = await import("../../standalone-public/breeding-rules.js");
    const parents = getDaycareStatus().parents;
    try {
      const plan = planBreeding(parents.find(p => p.id === parentA), parents.find(p => p.id === parentB), this.catalog);
      this.confirm(`${plan.name}: ${plan.cost} Gems / ${plan.battles} wins`, () => daycareAction("breed", { parentA, parentB }));
    } catch (error) { this.notice = error instanceof Error ? error.message : "Incompatible parents."; this.show(); }
  }
}
