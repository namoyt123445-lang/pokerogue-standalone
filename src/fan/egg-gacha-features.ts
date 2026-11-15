import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { Button } from "#enums/buttons";
import { TextStyle } from "#enums/text-style";
import { addTextObject } from "#ui/text";
import { addWindow } from "#ui/ui-theme";

export const GACHA_FEATURES = [
  { title: "Pokémon Boxes", menu: "Boxes", description: "Browse your owned Pokémon and open their details." },
  { title: "Daycare", menu: "Daycare", description: "Check your eggs, hatch companions and unlock nursery slots." },
  { title: "Breeding", menu: "Breeding", description: "Choose two parents to create an egg. Both parents stay yours." },
  { title: "Quests", menu: "Quests", description: "Open your quest board to check objectives and collect rewards." },
  { title: "Gem Rewards", menu: "Rewards", description: "Claim daily Gems and rewards for your battle victories." },
] as const;

/** Replaces only the original machine area/options. The real Egg Gacha handler
 * still owns its native background, voucher counters, footer and transitions.
 */
export class EggGachaFeatures {
  private root: Phaser.GameObjects.Container;
  private pages: Phaser.GameObjects.Container[] = [];
  private pointer: Phaser.GameObjects.Image;
  private page = 1;
  private row = 1;
  private opening = false;
  private destroyed = false;

  constructor(parent: Phaser.GameObjects.Container,
    private message: (text: string) => void,
    private open: (index: number) => Promise<boolean>,
    private exit: () => void) {
    this.root = globalScene.add.container(0, 0).setName("egg-gacha-feature-icons");
    parent.add(this.root);
    GACHA_FEATURES.forEach((feature, index) => {
      const page = globalScene.add.container(180 * (index - this.page), 18);
      let icon: Phaser.GameObjects.Image;
      if (index === 0) {
        const species = speciesDataRegistry.getSpecies(137);
        icon = globalScene.add.image(112, 61, species.getIconAtlasKey(), species.getIconId(false));
      } else if (index === 1) icon = globalScene.add.image(112, 61, "fan_daycare_building");
      else if (index === 2) icon = globalScene.add.image(112, 61, "egg", "egg_0");
      else icon = globalScene.add.image(112, 61, "items", index === 3 ? "map" : "water_gem");
      icon.setScale(88 / Math.max(icon.width, icon.height, 1));
      icon.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        if (this.opening) return;
        this.select(index); void this.activate();
      });
      const name = addTextObject(112, 110, feature.title, TextStyle.WINDOW_ALT, { fontSize: "64px" }).setOrigin(0.5, 0);
      page.add([icon, name]);
      this.pages.push(page); this.root.add(page);
    });
    // Same size, position, theme and row spacing as the native six-row pull menu.
    const options = globalScene.add.container(globalScene.scaledCanvas.width, 36);
    options.add(addWindow(0, 0, 96, 112).setOrigin(1, 0));
    [...GACHA_FEATURES.map(feature => feature.menu), "Back"].forEach((label, row) => {
      const button = addTextObject(-78, 8 + row * 16, label, TextStyle.WINDOW, { fontSize: "64px" })
        .setInteractive({ useHandCursor: true }).on("pointerdown", () => {
          if (this.opening) return;
          this.row = row;
          if (row < GACHA_FEATURES.length) this.select(row);
          void this.activate();
        });
      options.add(button);
    });
    this.pointer = globalScene.add.image(-87, 17 + this.row * 16, "cursor");
    options.add(this.pointer); this.root.add(options);
    const left = addTextObject(12, 72, "<", TextStyle.WINDOW_ALT, { fontSize: "96px" })
      .setInteractive({ useHandCursor: true }).on("pointerdown", () => this.step(-1));
    const right = addTextObject(202, 72, ">", TextStyle.WINDOW_ALT, { fontSize: "96px" })
      .setInteractive({ useHandCursor: true }).on("pointerdown", () => this.step(1));
    this.root.add([left, right]); this.select(this.page, false);
  }
  private select(index: number, animate = true): void {
    if (this.opening || this.destroyed) return;
    this.page = index; this.row = index;
    this.pointer.setY(17 + this.row * 16);
    globalScene.tweens.killTweensOf(this.pages);
    this.pages.forEach((page, i) => {
      page.setAlpha(i === index ? 1 : 0.45);
      if (!animate) page.setX(180 * (i - index));
      else globalScene.tweens.add({ targets: page, x: 180 * (i - index), duration: 250, ease: "Cubic.easeInOut" });
    });
    this.message(GACHA_FEATURES[index].description);
  }
  private step(direction: -1 | 1): void {
    if (this.opening) return;
    this.select((this.page + direction + GACHA_FEATURES.length) % GACHA_FEATURES.length);
    globalScene.ui.playSelect();
  }
  private async activate(): Promise<void> {
    if (this.opening || this.destroyed) return;
    globalScene.ui.playSelect();
    if (this.row === GACHA_FEATURES.length) { this.exit(); return; }
    this.opening = true; this.message(`Opening ${GACHA_FEATURES[this.page].title}...`);
    try {
      const opened = await this.open(this.page);
      if (opened && !this.destroyed) this.message(GACHA_FEATURES[this.page].description);
    } catch (error) {
      if (!this.destroyed) this.message(error instanceof Error ? error.message : "Please try again.");
    } finally { this.opening = false; }
  }
  processInput(button: Button): boolean {
    if (this.opening || this.destroyed) return false;
    if (button === Button.LEFT || button === Button.RIGHT) this.step(button === Button.LEFT ? -1 : 1);
    else if (button === Button.UP || button === Button.DOWN) {
      this.row = (this.row + (button === Button.UP ? -1 : 1) + 6) % 6;
      if (this.row < GACHA_FEATURES.length) this.select(this.row);
      else this.pointer.setY(17 + this.row * 16);
      globalScene.ui.playSelect();
    } else if (button === Button.ACTION || button === Button.SUBMIT) void this.activate();
    else if (button === Button.CANCEL) this.exit();
    else return false;
    return true;
  }
  destroy(): void {
    this.destroyed = true; globalScene.tweens.killTweensOf(this.pages);
    this.root.destroy();
  }
}
