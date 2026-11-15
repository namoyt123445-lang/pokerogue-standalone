import { cp, mkdir, readdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { biomeScenery } from "../src/fan/biome-scenery.ts";

// Vite's minify-public-json-files plugin already ships assets and locales.
await mkdir("dist", { recursive: true });
const indexPath = "dist/index.html";
let html = await readFile(indexPath, "utf8");
html = html.replaceAll("https://pokerogue.net/logo512.png", "./logo512.png")
  .replaceAll("https://pokerogue.net", "https://pokerogue-standalone.pages.dev")
  .replaceAll('content="PokéRogue"', 'content="PokéRogue Standalone — Unofficial Fan Build"')
  .replace("<title>PokéRogue</title>", "<title>PokéRogue Standalone — Unofficial Fan Build</title>");
html = html.replace('<html lang="en">', '<html lang="en" data-fan-presentation>');
if (!html.includes('href="/presentation.css"')) html = html.replace("</head>", '<link rel="stylesheet" href="/presentation.css">\n</head>');
// Leave the game's native canvas and touch-control DOM unchanged.
// Source is linked from the native Community/GitHub menu and /about.html.
await writeFile(indexPath, html);
await writeFile("dist/manifest.webmanifest", JSON.stringify({
  name: "PokéRogue Standalone — Unofficial Fan Build", short_name: "Rogue Fan",
  start_url: "/", scope: "/", display: "standalone", background_color: "#484050", theme_color: "#484050",
  icons: [{ src: "/logo512.png", sizes: "512x512", type: "image/png" }],
}));
await cp("standalone-public", "dist", { recursive: true });
// Preserve native texture keys and gameplay geometry, but ship HD source pixels.
for (const [, biome] of biomeScenery) {
  await cp(`standalone-public/scenery/biomes/${biome}.png`, `dist/images/arenas/${biome}_bg.png`);
}
// Cloudflare Pages free deployments allow 20,000 files. Preserve every JSON
// resource in same-origin packs; the Pages worker restores its original URL.
// Permit a static-art refresh of an already prepared build without nesting or
// erasing its existing JSON packs. Fresh Vite output simply starts empty.
const packs = await Promise.all(Array.from({ length: 128 }, async (_, i) => {
  try { return JSON.parse(await readFile(`dist/json-packs/${i}.json`, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}));
function bucket(url) {
  let hash = 0;
  for (const char of url) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 128;
}
async function packJson(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (path.resolve(file) === path.resolve("dist/json-packs")) continue;
    if (entry.isDirectory()) await packJson(file);
    else if (entry.name.endsWith(".json") && !["manifest.json", "asset-manifest.json"].includes(entry.name)) {
      const url = "/" + path.relative("dist", file).split(path.sep).join("/");
      packs[bucket(url)][url] = await readFile(file, "utf8");
      await unlink(file);
    }
  }
}
await packJson("dist");
await mkdir("dist/json-packs", { recursive: true });
for (let i = 0; i < packs.length; i++) await writeFile(`dist/json-packs/${i}.json`, JSON.stringify(packs[i]));
const serverModules = ["standalone-public/breeding-rules.js","server/save-store.mjs","server/daycare.mjs","server/accounts.mjs"];
const serverCode = (await Promise.all(serverModules.map(async file =>
  (await readFile(file,"utf8")).replace(/^import .*\r?\n/gm,"").replaceAll("export ","")
))).join("\n");
await writeFile("dist/_worker.js", `
const bucket = ${bucket.toString()};
const BREEDING_SPECIES = ${await readFile("server/species-breeding.json","utf8")};
${serverCode}
export default { async fetch(request, env) {
  const accountResponse = await handleAccounts(request, env);
  if (accountResponse) return accountResponse;
  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname);
  if (!pathname.endsWith('.json') || pathname.startsWith('/json-packs/') || ['/manifest.json','/asset-manifest.json'].includes(pathname)) return env.ASSETS.fetch(request);
  const packed = await env.ASSETS.fetch(new URL('/json-packs/' + bucket(pathname) + '.json', url));
  if (!packed.ok) return new Response('Not found', {status:404});
  const data = await packed.json();
  if (!Object.hasOwn(data, pathname)) return new Response('Not found', {status:404});
  return new Response(request.method === 'HEAD' ? null : data[pathname], {headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});
}};
`);
await writeFile("dist/_routes.json", JSON.stringify({version:1, include:["/api/fan/*","/*.json"], exclude:["/json-packs/*", "/manifest.json", "/asset-manifest.json"]}));
let count = 0;
async function countFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await countFiles(path.join(dir, entry.name));
    else count++;
  }
}
await countFiles("dist");
console.log(`Standalone output ready: ${count} files (all game assets self-hosted).`);
if (count > 20000) throw new Error("Cloudflare Pages file limit exceeded.");
