import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const code = await readFile("dist/_worker.js", "utf8");
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const env = { ASSETS: { async fetch(input) {
  const url = new URL(input.url ?? input);
  try { return new Response(await readFile("dist" + url.pathname)); }
  catch { return new Response("Not found", { status: 404 }); }
} } };
for (const url of ["/locales/en/menu.json", "/images/pokemon/1.json", "/images/ui/prompt.json", "/manifest.json", "/asset-manifest.json"]) {
  const response = await worker.fetch(new Request("https://example.test" + url), env);
  assert.equal(response.status, 200, url);
  JSON.parse(await response.text());
}
const missing = await worker.fetch(new Request("https://example.test/not-a-real-file.json"), env);
assert.equal(missing.status, 404);
const html = await readFile("dist/index.html", "utf8");
assert(!html.includes("https://pokerogue.net"));
assert(html.includes("Unofficial Fan Build"));
assert(!html.includes('id="fan-collection"'));
assert(!html.includes('id="fan-launcher"'));
assert(!html.includes('position:fixed;bottom:4px'));
const about = await readFile("dist/about.html", "utf8");
assert(about.includes("https://github.com/namoyt123445-lang/pokerogue-standalone"));
const headers = await readFile("dist/_headers", "utf8");
assert(headers.includes("connect-src 'self'"));
console.log("Standalone checks passed: JSON routing, manifests, missing files, metadata, and same-origin policy.");
