import test from "node:test";
import assert from "node:assert/strict";
import { biomeScenery, arenaBackgroundLayout } from "../src/fan/biome-scenery.ts";
import { BiomeId } from "../src/enums/biome-id.ts";
test("each native biome has exactly one distinct high-definition backdrop",()=>{
  assert.equal(biomeScenery.length,35);
  assert.deepEqual(biomeScenery.map(([id])=>id).sort((a,b)=>a-b),Object.values(BiomeId).sort((a,b)=>a-b));
  assert.equal(new Set(biomeScenery.map(([,key])=>key)).size,35);
});
test("HD pixels fill the original 1920x1080 viewport, not a zoomed/cropped image",()=>{
  const layout=arenaBackgroundLayout(1280,720,true);
  assert.equal(1280*layout.scaleX,1920);assert.equal(720*layout.scaleY,1080);
  assert.equal(layout.width,320);assert.equal(layout.height,240);
  assert.equal(layout.width*6,1920); // Native field-zoom math must not use 1280.
  assert.equal(layout.hd,true);
});
test("original assets and non-standalone games retain their native scale",()=>{
  assert.equal(arenaBackgroundLayout(320,180,true).scaleX,6);
  assert.equal(arenaBackgroundLayout(1280,720,false).scaleX,6);
  assert.equal(arenaBackgroundLayout(320,180,true).hd,false);
});
