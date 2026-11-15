import { setArenaBackgroundTexture } from "../../../src/fan/arena-background";
import type Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";

describe("HD arena background integration", () => {
  function sprite() {
    const background = {
      frame: { realWidth: 1280, realHeight: 720 },
      width: 1280, height: 720, scaleX: 6, scaleY: 6,
      texture: { setFilter: vi.fn() },
      setTexture: vi.fn(function (this: any) { this.width=1280;this.height=720;return this; }),
      setScale: vi.fn(function (this: any,x:number,y:number) { this.scaleX=x;this.scaleY=y;return this; }),
      setSize: vi.fn(function (this: any,w:number,h:number) { this.width=w;this.height=h;return this; }),
    };
    return background;
  }
  it("fits the full HD texture and retains field coordinates after every biome switch", () => {
    const background=sprite();
    for (const key of ["town_bg","forest_bg","ice_cave_bg","end_bg"]) {
      setArenaBackgroundTexture(background as unknown as Phaser.GameObjects.Sprite,key,true);
      expect(background.scaleX*background.frame.realWidth).toBe(1920);
      expect(background.scaleY*background.frame.realHeight).toBe(1080);
      expect(background.width*6).toBe(1920);
      expect(background.height).toBe(240);
    }
    expect(background.texture.setFilter).toHaveBeenCalledWith(1);
  });
  it("does not alter native non-standalone rendering", () => {
    const background=sprite();
    setArenaBackgroundTexture(background as unknown as Phaser.GameObjects.Sprite,"town_bg",false);
    expect(background.setScale).not.toHaveBeenCalled();
    expect(background.setSize).not.toHaveBeenCalled();
    expect(background.texture.setFilter).not.toHaveBeenCalled();
  });
});
