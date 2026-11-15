import type Phaser from "phaser";
import { arenaBackgroundLayout } from "./biome-scenery";

/** Fit HD artwork without changing the native field's 320-unit coordinate space. */
export function setArenaBackgroundTexture(
  background: Phaser.GameObjects.Sprite,
  key: string,
  hdEnabled = import.meta.env.MODE === "standalone",
): void {
  background.setTexture(key);
  if (!hdEnabled) return;
  const { realWidth, realHeight } = background.frame;
  const layout = arenaBackgroundLayout(realWidth, realHeight, true);
  background.setScale(layout.scaleX, layout.scaleY).setSize(layout.width, layout.height);
  // LINEAR applies to scenery only; Pokémon, fonts and menu assets stay crisp.
  if (layout.hd) background.texture.setFilter(1);
}
