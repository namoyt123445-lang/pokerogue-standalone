import { globalScene } from "#app/global-scene";
import { TextStyle } from "#enums/text-style";
import { UiMode } from "#enums/ui-mode";
import { addTextObject } from "#ui/text";
import { getAccountUser, syncCloud, api, writeSnapshot } from "../../standalone-public/cloud.js";
import { daycareServerNow, getDaycareStatus, startDaycareSync, refreshDaycare, daycareAction, flushDaycareBattles } from "../../standalone-public/daycare-client.js";
import { formatDaycareTime, planBreeding } from "../../standalone-public/breeding-rules.js";
import { canManageCollectionAtPhase, collectionTransaction, type OwnedRecord } from "./ownership-store";
import { materializeDaycareCollection } from "./ownership";
import { openNativeAccount } from "./account-ui";
import type { HubView, HubCard, HubIcon } from "./trainer-hub-art";

const installed = new WeakSet<object>();
export function installDaycareStatus(): void {
  if (import.meta.env.MODE !== "standalone" || installed.has(globalScene.ui)) return;
  installed.add(globalScene.ui); startDaycareSync();
  const { width, height } = globalScene.scaledCanvas;
  const label = addTextObject(width / 2, -height + 1, "", TextStyle.MESSAGE, { fontSize: "30px" }).setOrigin(0.5, 0);
  globalScene.ui.add(label);
  globalScene.time.addEvent({ delay: 1000, loop: true, callback: () => {
    const data = getDaycareStatus();
    label.setVisible(!!getAccountUser() && !!data && globalScene.ui.mode !== UiMode.TRAINER_HUB && globalScene.ui.mode !== UiMode.EGG_GACHA);
    if (!data) return;
    const remaining = Math.max(0, data.state.legendaryNextAt - daycareServerNow());
    label.setText(`Gems: ${data.state.gems} | Legendary: ${remaining ? formatDaycareTime(remaining) : "Ready"}`);
  } });
}
export function openDaycare(initialTab = 1): boolean {
  void openDaycareScreen(initialTab);
  return true;
}
export async function openDaycareScreen(initialTab = 1): Promise<boolean> {
  if (!canManageCollectionAtPhase(globalScene.phaseManager.getCurrentPhase().phaseName)) {
    globalScene.ui.showText("Save and quit your run, then open this feature from the title screen.", null, () => globalScene.ui.showText(""), 1500);
    return false;
  }
  if (!getAccountUser()) return openNativeAccount();
  try {
    await syncCloud(); await refreshDaycare(); await flushDaycareBattles();
    const { catalog } = await api("daycare/catalog");
    const collection = await collectionTransaction();
    new TrainerHub(catalog, collection.records).open(initialTab);
    return true;
  } catch (error) {
    console.error(error); openNativeAccount(error instanceof Error ? error.message : "Cloud sync needs attention.");
    return false;
  }
}

const TITLES = ["Pokémon Boxes", "Daycare Nursery", "Breeding Center", "Quest Board", "Gem Rewards"];
const DESCRIPTIONS = [
  "Every companion has its own story.",
  "A safe place for little beginnings.",
  "Two companions. A brand-new adventure.",
  "Small adventures, permanent rewards.",
  "Earn, collect and build your nursery.",
];

/** Screen controller: each destination, egg, quest and Pokémon opens its own view. */
export class TrainerHub {
  private tab = 1;
  private busy = false;
  private notice = "";
  private current: HubView | null = null;
  private pending = new Map<string, string>();
  constructor(private catalog: Record<string, { name: string }>, private records: OwnedRecord[] = []) {}
  open(initialTab = 1): void { this.tab = initialTab; this.section(); }
  private show(view: HubView): void {
    view.busy = this.busy; view.notice = this.notice;
    this.current = view;
    if (globalScene.ui.mode === UiMode.TRAINER_HUB) globalScene.ui.getHandler().show([view]);
    else globalScene.ui.setOverlayMode(UiMode.TRAINER_HUB, view);
  }
  private card(title: string, caption: string, icon: HubIcon, action: () => void, details?: string[]): HubCard {
    return { title, caption, icon, action, details };
  }
  private view(title: string, subtitle: string, cards: HubCard[], onBack: () => void, extra: Partial<HubView> = {}): HubView {
    return {
      title, subtitle, gems: getDaycareStatus().state.gems, tab: this.tab, cards, onBack,
      onTab: direction => { if (!this.busy) { this.tab = (this.tab + direction + 5) % 5; this.notice = ""; this.section(); } },
      notice: this.notice, busy: this.busy, ...extra,
    };
  }
  private async mutate(kind: string, details: Record<string, unknown> = {}): Promise<any> {
    const key = JSON.stringify([kind, details]);
    const request = this.pending.get(key) || crypto.randomUUID(); this.pending.set(key, request);
    try {
      const result = await daycareAction(kind, details, request); this.pending.delete(key); return result;
    } catch (error) {
      if ((error as { status?: number }).status === 400) this.pending.delete(key);
      throw error;
    }
  }
  private async run(action: () => Promise<unknown>): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.notice = "Saving securely...";
    if (this.current) this.show(this.current);
    try { await action(); this.notice = "Saved! Your progress is safe."; }
    catch (error) {
      this.notice = error instanceof Error ? error.message : "Please try again.";
      try { await refreshDaycare(); } catch { /* Preserve the last state offline. */ }
    } finally { this.busy = false; this.section(); }
  }
  private confirm(title: string, details: string[], icon: HubIcon, action: () => Promise<unknown>, hero?: HubIcon[]): void {
    this.show(this.view(title, "Review before confirming.", [
      this.card("Confirm", "Spend only after confirmation", icon, () => { void this.run(action); }, details),
      this.card("Cancel", "Keep everything unchanged", this.tab, () => this.section(), details),
    ], () => this.section(), { hero: hero || [icon], details }));
  }
  private parentIcon(id: string): HubIcon {
    const p = getDaycareStatus().parents.find(p => p.id === id);
    const record = this.records.find(r => r.id === id);
    return record ? record.data : p ? { ...p.data, shiny: p.shiny } : 2;
  }
  private section(): void {
    const { state, rules, parents, quests = [] } = getDaycareStatus();
    let cards: HubCard[] = [];
    const details = [DESCRIPTIONS[this.tab], "Click a card to open its details."];
    if (this.tab === 0) {
      cards = parents.map(p => {
        const record = this.records.find(r => r.id === p.id);
        return this.card(p.name, `Lv.${p.level} • ${record?.location === "party" ? "Previous party" : `PC Box ${(record?.box || 0) + 1}`} • #${p.id.slice(0, 6)}`,
          this.parentIcon(p.id), () => this.pokemon(p.id), [`${p.name}${p.shiny ? " ★" : ""}`, `Level ${p.level}`, "Open for stats and individual details."]);
      });
      if (!cards.length) cards.push(this.card("Your journey starts here", "Choose a starter in New Game", 0, () => globalScene.ui.revertMode()));
    } else if (this.tab === 1) {
      for (let slot = 0; slot < state.slots; slot++) {
        const egg = state.eggs[slot];
        if (egg) {
          const done = Math.min(egg.battles, state.totalBattles - egg.createdBattle);
          const card = this.card(`${egg.name} egg`, done >= egg.battles ? "Ready to hatch!" : `${done}/${egg.battles} victories`, 2,
            () => this.egg(egg.id), [egg.legendary ? "Legendary egg" : "Companion egg", `${done}/${egg.battles} victories`, "Hatches into your permanent PC."]);
          card.progress = [done, egg.battles]; cards.push(card);
        } else cards.push(this.card(`Slot ${slot + 1} is ready`, "A little home for a new egg", 1,
          () => { this.tab = 2; this.section(); }, ["Permanent nursery slot", "Visit Breeding to choose parents."]));
      }
      const price = rules.slotPrices[state.slots - 1];
      if (price !== undefined) cards.push(this.card("Expand your nursery", `Permanent slot ${state.slots + 1} • ${price} Gems`, 1,
        () => this.confirm("Unlock nursery slot?", [`Cost: ${price} Gems`, `Unlocks slot ${state.slots + 1} permanently.`, "Maximum: six slots."], 1, () => this.mutate("slot"))));
      cards.push(this.card("Existing eggs", "Your original eggs are preserved", 2, () => {
        if (!globalScene.gameData.eggs.length) { this.notice = "No original eggs at the moment."; this.section(); return; }
        globalScene.ui.revertMode(); globalScene.ui.setOverlayMode(UiMode.EGG_LIST);
      }));
    } else if (this.tab === 2) {
      cards = [
        this.card("Choose your parents", "Individual Pokémon, not species unlocks", 2, () => this.chooseParent(),
          ["Normal egg: 5 Gems", "Hatch after 10 victories.", "Both parents stay yours."]),
        this.card("Legendary breeding", "Owned legendary/mythical + Ditto", { species: 132 }, () => this.chooseParent(),
          ["25 Gems • 40 victories", "One legendary egg per account every 24 real hours.", "No exclusive quest required."]),
        this.card("Breeding guide", "Compatibility and inheritance", 3, () => this.guide()),
      ];
    } else if (this.tab === 3) {
      cards = quests.map(q => {
        const card = this.card(q.name, q.claimed ? "Completed • reward collected" : `${Math.min(q.progress, q.goal)}/${q.goal} • ${q.gems} Gems`, 3,
          () => this.quest(q.id), [q.description, `Reward: ${q.gems} Gems`, q.claimed ? "Reward collected." : "Open quest for details."]);
        card.progress = [q.progress, q.goal]; return card;
      });
    } else {
      cards = [
        this.card("Daily Gem supply", "10 Gems every 24 hours", 4, () => this.reward("daily"),
          ["Claim 10 permanent Gems.", "Server-timed rolling 24-hour supply."]),
        this.card("Daily battle task", `${Math.min(state.daily.battles, 20)}/20 victories • 10 Gems`, 3, () => this.reward("task"),
          ["Win 20 battles in the daily window.", "Claim once for 10 Gems."]),
        this.card("Battle rewards", "2 Gems for every 10 victories", 4, () => this.guide("rewards"),
          ["Automatically rewarded.", "First 200 victories per daily window.", `${state.totalBattles} total victories recorded.`]),
        this.card("Refresh progress", "Sync queued offline victories", 0, () => { void this.run(async () => { await flushDaycareBattles(); await refreshDaycare(); }); }),
      ];
    }
    this.show(this.view(TITLES[this.tab], DESCRIPTIONS[this.tab], cards, () => globalScene.ui.revertMode(), { details,
      liveSubtitle: this.tab === 1 || this.tab === 2 ? () => {
        const remaining = Math.max(0, getDaycareStatus().state.legendaryNextAt - daycareServerNow());
        return `Legendary breeding: ${remaining ? formatDaycareTime(remaining) : "READY"}`;
      } : undefined }));
  }
  private pokemon(id: string): void {
    const p = getDaycareStatus().parents.find(p => p.id === id);
    if (!p) return;
    const r = this.records.find(record => record.id === id);
    const d = r?.data;
    const lines = [`${p.name}${p.shiny ? " ★ Shiny" : ""}`, `Level ${p.level}`, `Individual #${id.slice(0, 8)}`,
      `Gender: ${p.data.gender === 1 ? "Female" : p.data.gender === 0 ? "Male" : "Genderless"}`,
      ...(d ? [`IVs HP/Atk/Def:\n${d.ivs?.slice(0, 3).join(" / ")}`, `SpA/SpD/Speed:\n${d.ivs?.slice(3).join(" / ")}`] : [])];
    this.show(this.view(p.name, "A permanent individual in your collection.", [
      this.card("Use as breeding parent", "Choose a compatible partner next", this.parentIcon(id), () => { this.tab = 2; this.chooseParent(id); }, lines),
      this.card("Back to collection", "Browse your other companions", 0, () => this.section(), lines),
    ], () => this.section(), { hero: [this.parentIcon(id)], details: lines }));
  }
  private egg(id: string): void {
    const { state } = getDaycareStatus(), egg = state.eggs.find(e => e.id === id); if (!egg) return;
    const done = Math.min(egg.battles, state.totalBattles - egg.createdBattle), ready = done >= egg.battles;
    const details = [`${egg.name} egg`, `${done}/${egg.battles} victories`, ready ? "Ready to hatch!" : `${egg.battles - done} victories remaining.`,
      "Parents stay owned.", "Baby arrives at level 5 in PC."];
    const hatch = this.card(ready ? "Hatch into PC" : "Still growing", ready ? "Welcome your new companion" : "Win more battles to hatch", 2,
      () => this.confirm(`Hatch ${egg.name}?`, details, 2, async () => {
        const result = await this.mutate("hatch", { eggId: id });
        await writeSnapshot(result.cloud.save, result.cloud.revision); await materializeDaycareCollection();
        this.records = (await collectionTransaction()).records; await syncCloud();
      }), details);
    hatch.disabled = !ready;
    this.show(this.view(`${egg.name} egg`, egg.legendary ? "Legendary nursery" : "A new beginning", [
      hatch, this.card("Back to nursery", "Keep incubating safely", 1, () => this.section(), details),
    ], () => this.section(), { hero: [this.parentIcon(egg.parents[0]), 2, this.parentIcon(egg.parents[1])], details }));
  }
  private quest(id: string): void {
    const q = getDaycareStatus().quests.find(q => q.id === id); if (!q) return;
    const details = [q.description, `Progress: ${Math.min(q.progress, q.goal)}/${q.goal}`, `Reward: ${q.gems} Gems`,
      "One-time trial quest.", q.id.startsWith("collection") ? "Counts all owned individuals, including starters and hatches." : ""];
    const claim = this.card(q.claimed ? "Reward collected" : "Claim quest reward", `${q.gems} permanent Gems`, 4,
      () => { void this.run(() => this.mutate("quest", { questId: id })); }, details);
    claim.disabled = q.claimed || q.progress < q.goal;
    this.show(this.view(q.name, q.claimed ? "Quest completed!" : "Your next little adventure.", [
      claim, this.card("Back to quest board", "Find your next adventure", 3, () => this.section(), details),
    ], () => this.section(), { hero: [3, 4], details }));
  }
  private reward(kind: "daily" | "task"): void {
    const { state, rules } = getDaycareStatus(), now = daycareServerNow();
    const expired = now - state.daily.startedAt >= rules.cooldownMs;
    const ready = kind === "daily" ? now >= state.dailyNextAt : !expired && state.daily.battles >= 20 && !state.daily.taskClaimed;
    const details = kind === "daily" ? ["10 permanent Gems.", ready ? "Your supply is ready." : `Next: ${formatDaycareTime(state.dailyNextAt - now)}`, "A rolling 24-hour server timer."]
      : [`${expired ? 0 : Math.min(state.daily.battles, 20)}/20 victories`, "Reward: 10 Gems", state.daily.taskClaimed && !expired ? "Already collected." : "Complete the task to claim."];
    const claim = this.card(ready ? "Claim 10 Gems" : "Not ready yet", "Gems stay with your account", 4,
      () => { void this.run(() => this.mutate(kind)); }, details);
    claim.disabled = !ready;
    this.show(this.view(kind === "daily" ? "Daily supply" : "Daily battle task", "Permanent rewards for your adventure.", [
      claim, this.card("Back to rewards", "Check your other rewards", 4, () => this.section(), details),
    ], () => this.section(), { hero: [4], details }));
  }
  private guide(kind = "breeding"): void {
    const details = kind === "rewards" ? ["30 welcome Gems once.", "10 daily Gems.", "2 Gems / 10 wins.", "Battle cap: 200/day.", "20-win task: 10 Gems."]
      : ["Shared egg groups + opposite genders, or compatible parent + Ditto.", "Three inherited IVs.", "Random nature.", "Shiny chance: 1/512.", "Base form; no fusions.", "Regional/custom species unsupported."];
    this.show(this.view(kind === "rewards" ? "Gem guide" : "Breeding guide", "Everything stays inside your game.", [
      this.card("Back", "Return to the previous section", this.tab, () => this.section(), details),
    ], () => this.section(), { hero: [kind === "rewards" ? 4 : 2], details }));
  }
  private chooseParent(first?: string): void {
    const parents = getDaycareStatus().parents.filter(p => p.id !== first);
    this.show(this.view(first ? "Choose a partner" : "Choose first parent", "Select an individual from your owned Pokémon.", parents.map(p =>
      this.card(p.name, `Lv.${p.level} • ${p.data.gender === 1 ? "Female" : p.data.gender === 0 ? "Male" : "Genderless"} • #${p.id.slice(0, 6)}`,
        this.parentIcon(p.id), () => { if (first) this.preview(first, p.id); else this.chooseParent(p.id); },
        [p.name, `Level ${p.level}`, "Parents remain yours after breeding."])),
    () => this.section()));
  }
  private preview(parentA: string, parentB: string): void {
    const parents = getDaycareStatus().parents;
    try {
      const plan = planBreeding(parents.find(p => p.id === parentA), parents.find(p => p.id === parentB), this.catalog);
      this.confirm(`${plan.name} egg`, [`Cost: ${plan.cost} Gems`, `${plan.battles} victories to hatch.`,
        "Both parents remain owned.", ...(plan.legendary ? ["Starts the shared 24-hour legendary cooldown."] : [])], 2,
      () => this.mutate("breed", { parentA, parentB }), [this.parentIcon(parentA), 2, this.parentIcon(parentB)]);
    } catch (error) { this.notice = error instanceof Error ? error.message : "Incompatible parents."; this.section(); }
  }
}
