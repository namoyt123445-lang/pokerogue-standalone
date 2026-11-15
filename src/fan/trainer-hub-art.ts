import { globalScene } from "#app/global-scene";
import { TextStyle } from "#enums/text-style";
import { UiMode } from "#enums/ui-mode";
import { addTextObject } from "#ui/text";
import { addWindow } from "#ui/ui-theme";

// Original tiny pixel sprites, generated as native textures (no remote art).
const palette: Record<string, number> = {
  k: 0x203044, w: 0xf5efcf, g: 0x72b9a0, b: 0x64c5eb,
  d: 0x38718e, y: 0xf5cc66, o: 0xd57b50, p: 0xe990ad,
};
const patterns = [
  [
    "................", "..kkkkkkkkkkkk..", "..kwwwwwwwwwwk..", "..kwbbbbbbbbwk..",
    "..kwbddddbbbwk..", "..kwbddbbbbbwk..", "..kwbbbbbbbbwk..", "..kwwwwwwwwwwk..",
    "..kkkkkkkkkkkk..", "......kggk......", "....kkkkkkkk....", "..kkkkkkkkkkkk..",
    "..kggggggggggk..", "..kggkkgggyggk..", "..kkkkkkkkkkkk..", "................",
  ],
  [
    ".......kk.......", "......kook......", ".....koooook....", "....koooooook...",
    "...koooooooook..", "..kkkkkkkkkkkkk.", "...kwwwwwwwwwk..", "...kwggwwwggwk..",
    "...kwggwwwggwk..", "...kwwwwwwwwwk..", "...kwwwkkkwwwk..", "...kwwwkgkwwwk..",
    "...kwwwkgkwwwk..", "..kkkkkkkkkkkk..", "..gggggggggggg..", "................",
  ],
  [
    "................", ".....kkkkkk.....", "....kwwwwwwk....", "...kwwwwwwwwk...",
    "...kwwwppwwwk...", "..kwwwppppwwwk..", "..kwwwppppwwwk..", "..kwwwwwwwwwwk..",
    "..kwwwwwwwppwk..", "..kwppwwwpppwk..", "...kppwwwwwwk...", "...kwwwwwwwwk...",
    "....kwwwwwwk....", ".....kkkkkk.....", "................", "................",
  ],
  [
    "................", "...kkkkkkkkkk...", "..kyyyyyyyyyyk..", "..kywwwwwwwwyk..",
    "...kwwwwwwwwk...", "...kwkkkkwwwk...", "...kwwwwwwwwk...", "...kwkkkkkwwk...",
    "...kwwwwwwwwk...", "...kwkkkkwwwk...", "...kwwwwwwwwk...", "...kwwwppwwwk...",
    "..kyyyyppyyyyk..", "..kyyyyppyyyyk..", "...kkkkkkkkkk...", "................",
  ],
  [
    "................", ".....kkkkkk.....", "....kbbbbbbk....", "...kbbwwbbbbk...",
    "..kbbbwwbbbbbk..", "..kbbbbbbbbbbk..", "..kbbdbbbdbbbk..", "...kbdbbbdbbk...",
    "....kdbbbdbk....", ".....kdbbdk.....", "......kddk......", ".......kk.......",
    "................", "....y......y....", "................", "................",
  ],
];

export class TrainerHubArt {
  private container: Phaser.GameObjects.Container;
  private destroyed = false;
  constructor(private navigate: (tab: number) => void) {
    const { width, height } = globalScene.scaledCanvas;
    this.container = globalScene.add.container(0, 0).setName("native-trainer-hub-art");
    globalScene.ui.add(this.container);
    this.container.add(addWindow(0, -height, width, height).setOrigin(0));
    this.container.add(addTextObject(width / 2, -height + 5, "TRAINER HUB", TextStyle.WINDOW, { fontSize: "48px" }).setOrigin(0.5, 0));
    patterns.forEach((pattern, index) => {
      const key = `fan-hub-tab-${index}`;
      if (globalScene.textures.exists(key)) return;
      const canvas = document.createElement("canvas");
      canvas.width = 16; canvas.height = 16;
      const context = canvas.getContext("2d")!;
      for (let y = 0; y < pattern.length; y++) for (let x = 0; x < pattern[y].length; x++) {
        const color = palette[pattern[y][x]];
        if (color !== undefined) {
          context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
          context.fillRect(x, y, 1, 1);
        }
      }
      globalScene.textures.addCanvas(key, canvas);
    });
    globalScene.events.on("update", this.checkMode, this);
    globalScene.events.once("shutdown", this.destroy, this);
  }
  private checkMode(): void {
    // Also clean up if another native menu takes over unexpectedly.
    if (globalScene.ui.mode !== UiMode.OPTION_SELECT) this.destroy();
  }
  draw(tab: number): void {
    if (this.destroyed) return;
    while (this.container.length > 2) this.container.removeAt(2, true);
    const { width, height } = globalScene.scaledCanvas;
    const names = ["BOXES", "DAYCARE", "BREEDING", "QUESTS", "GEMS"];
    names.forEach((name, i) => {
      const x = width * (i + 0.5) / names.length;
      const tile = globalScene.add.rectangle(x, -height + 49, width / 5 - 5, 53,
        i === tab ? 0x375d6d : 0x243440, 1).setStrokeStyle(1, i === tab ? 0xf5cc66 : 0x536773);
      tile.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.navigate(i));
      this.container.add(tile);
      this.container.add(globalScene.add.image(x, -height + 43, `fan-hub-tab-${i}`).setScale(i === tab ? 2 : 1.7));
      this.container.add(addTextObject(x, -height + 64, name, TextStyle.WINDOW, { fontSize: "32px" }).setOrigin(0.5, 0));
    });
    const left = addTextObject(5, -height + 7, "<", TextStyle.WINDOW, { fontSize: "48px" }).setInteractive({ useHandCursor: true });
    const right = addTextObject(width - 12, -height + 7, ">", TextStyle.WINDOW, { fontSize: "48px" }).setInteractive({ useHandCursor: true });
    left.on("pointerdown", () => this.navigate((tab + 4) % 5));
    right.on("pointerdown", () => this.navigate((tab + 1) % 5));
    this.container.add([left, right]);
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    globalScene.events.off("update", this.checkMode, this);
    globalScene.events.off("shutdown", this.destroy, this);
    this.container.destroy();
  }
}
