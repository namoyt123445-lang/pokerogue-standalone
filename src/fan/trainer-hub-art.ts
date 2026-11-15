import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { TextStyle } from "#enums/text-style";
import { addTextObject } from "#ui/text";
import { addWindow } from "#ui/ui-theme";

export interface HubPokemonArt { species: number; formIndex?: number; gender?: number; shiny?: boolean; variant?: number }
export type HubIcon = number | HubPokemonArt;
export interface HubCard {
  title: string; caption?: string; icon?: HubIcon; details?: string[] | undefined;
  progress?: [number, number]; disabled?: boolean; action: () => void;
}
export interface HubView {
  title: string; subtitle: string; gems: number; tab: number;
  liveSubtitle?: (() => string) | undefined;
  cards: HubCard[]; details?: string[]; hero?: HubIcon[]; notice?: string; busy?: boolean;
  onBack: () => void; onTab: (direction: -1 | 1) => void;
}
export interface HubRenderer {
  render(view: HubView, cursor: number, choose: (index: number) => void, move: (delta: number) => void): void;
  destroy(): void;
}

/** Actual Pokémon item/egg/portrait textures and credited fan-made Day-Care tile.
 * No generated illustrations, drawn substitute icons or hub landing screen.
 */
export class TrainerHubArt implements HubRenderer {
  private container = globalScene.add.container(0, -globalScene.scaledCanvas.height).setName("daycare-detail-screen");
  constructor() { globalScene.ui.add(this.container); }
  private text(x: number, y: number, value: string, size = 42, width = 0, color?: string): void {
    this.container.add(addTextObject(x, y, value, TextStyle.WINDOW, {
      fontSize: `${size}px`, ...(width ? { wordWrap: { width: width * 6 } } : {}), ...(color ? { color } : {}),
    }));
  }
  private icon(icon: HubIcon = 0, x: number, y: number, scale = 1): void {
    if (typeof icon === "number") {
      if (icon === 0) { this.icon({ species: 137 }, x, y, scale); return; }
      const [key, frame] = icon === 1 ? ["fan_daycare_building", undefined]
        : icon === 3 ? ["items", "map"] : icon === 4 ? ["items", "water_gem"] : ["egg", "egg_0"];
      if (!globalScene.textures.exists(key)) return;
      const image = globalScene.add.image(x, y, key, frame);
      const ratio = 32 * scale / Math.max(image.width, image.height, 1);
      this.container.add(image.setScale(ratio)); return;
    }
    try {
      const species = speciesDataRegistry.getSpecies(icon.species);
      const key = species.getIconAtlasKey(icon.formIndex || 0, !!icon.shiny, icon.variant || 0);
      const frame = species.getIconId(icon.gender === 1, icon.formIndex || 0, !!icon.shiny, icon.variant || 0);
      if (!globalScene.textures.exists(key)) throw new Error("Icon unavailable");
      this.container.add(globalScene.add.image(x, y, key, frame).setScale(scale));
    } catch { this.icon(2, x, y, scale); }
  }
  private button(x: number, y: number, w: number, h: number, selected: boolean, click: () => void): void {
    this.container.add(globalScene.add.rectangle(x, y, w, h, selected ? 0x355e69 : 0x233948)
      .setOrigin(0).setStrokeStyle(1, selected ? 0xf4cd78 : 0x58717a)
      .setInteractive({ useHandCursor: true }).on("pointerdown", click));
  }
  render(view: HubView, cursor: number, choose: (index: number) => void, move: (delta: number) => void): void {
    this.container.removeAll(true);
    const { width, height } = globalScene.scaledCanvas;
    this.container.add(addWindow(0, 0, width, height).setOrigin(0));
    this.container.add(globalScene.add.rectangle(3, 3, width - 6, 29, 0x183846).setOrigin(0));
    this.text(10, 6, view.title, 64);
    this.text(10, 21, view.liveSubtitle?.() || view.subtitle, 30, 230, "#bdd9d2");
    this.icon(4, width - 43, 15, 0.55); this.text(width - 32, 10, `${view.gems}`, 48, 0, "#f6d88b");
    const back = addTextObject(width - 10, height - 14, "BACK", TextStyle.WINDOW, { fontSize: "36px" })
      .setOrigin(1, 0).setInteractive({ useHandCursor: true }).on("pointerdown", () => { if (!view.busy) view.onBack(); });
    const left = addTextObject(12, 35, "<", TextStyle.WINDOW, { fontSize: "48px" })
      .setInteractive({ useHandCursor: true }).on("pointerdown", () => view.onTab(-1));
    const right = addTextObject(185, 35, ">", TextStyle.WINDOW, { fontSize: "48px" })
      .setInteractive({ useHandCursor: true }).on("pointerdown", () => view.onTab(1));
    this.container.add([back, left, right]);
    const hero = view.hero || [];
    if (hero.length) hero.forEach((icon, i) => this.icon(icon, 35 + i * 58, 70, 1.45));
    const count = hero.length ? 2 : 4, start = Math.floor(cursor / count) * count;
    const top = hero.length ? 105 : 51;
    view.cards.slice(start, start + count).forEach((card, offset) => {
      const i = start + offset, y = top + offset * 26;
      this.button(10, y, 184, 24, i === cursor, () => choose(i));
      this.icon(card.icon ?? view.tab, 24, y + 12, 0.58);
      this.text(39, y + 3, card.title, 40, 150, card.disabled ? "#839a9a" : undefined);
      if (card.caption) this.text(39, y + 14, card.caption, 28, 150, "#bed5cb");
      if (card.progress) {
        const [value, goal] = card.progress;
        this.container.add(globalScene.add.rectangle(12, y + 22, 180, 2, 0x172a38).setOrigin(0));
        this.container.add(globalScene.add.rectangle(12, y + 22, 180 * Math.min(1, Math.max(0, value / Math.max(1, goal))), 2, 0x8bd2b1).setOrigin(0));
      }
    });
    this.container.add(addWindow(202, 35, width - 209, 122).setOrigin(0));
    const selected = view.cards[cursor];
    this.icon(selected?.icon ?? view.tab, 255, 62, 1.2);
    const details = selected?.details || view.details || [];
    const estimatedLines = details.reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 19)), 0);
    this.text(209, 84, details.join("\n"), Math.min(36, Math.max(22, Math.floor(370 / Math.max(1, estimatedLines)))), 96, "#d6e7d6");
    const pages = Math.max(1, Math.ceil(view.cards.length / count));
    if (pages > 1) {
      const previous = addTextObject(112, 37, "<", TextStyle.WINDOW, { fontSize: "36px" })
        .setInteractive({ useHandCursor: true }).on("pointerdown", () => move(-count));
      const next = addTextObject(164, 37, ">", TextStyle.WINDOW, { fontSize: "36px" })
        .setInteractive({ useHandCursor: true }).on("pointerdown", () => move(count));
      this.container.add([previous, next]);
      this.text(127, 37, `${Math.floor(cursor / count) + 1}/${pages}`, 32);
    }
    this.text(10, height - 14, "↑↓ Select  ·  ←→ Sections  ·  Confirm: open", 28);
    if (view.notice) {
      this.container.add(globalScene.add.rectangle(8, height - 31, width - 16, 14, 0x173745).setOrigin(0));
      this.text(12, height - 29, view.notice, 30, width - 25, "#ffe0a1");
    }
    globalScene.ui.bringToTop(this.container);
  }
  destroy(): void { this.container.destroy(); }
}
