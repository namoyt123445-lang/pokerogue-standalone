import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { PokemonData } from "#system/pokemon-data";
import { collectionTransaction, moveRecord, type CollectionSave, type OwnedRecord } from "./ownership-store";
import { individualOwnershipEnabled } from "./ownership";

export type TeamSelection = { starter: number } | { records: OwnedRecord[] };
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text: string, handler: () => void | Promise<void>, className = ""): HTMLButtonElement {
  const node = el("button", text, className);
  node.type = "button";
  node.onclick = () => { Promise.resolve(handler()).catch(error => window.alert((error as Error).message)); };
  return node;
}
function name(record: OwnedRecord): string { return record.data.nickname || speciesDataRegistry.getSpecies(record.data.species).getName(); }
function sprite(id: number, shiny = false): HTMLElement {
  const species = speciesDataRegistry.getSpecies(id);
  const image = el("img");
  image.src = `/images/pokemon/icons/${species.generation}/${id}${shiny ? "s" : ""}.png`;
  image.alt = species.getName();
  image.onerror = () => { image.style.visibility = "hidden"; };
  return image;
}
function styles(): void {
  if (document.getElementById("fan-collection-style")) return;
  const style = el("style"); style.id = "fan-collection-style";
  style.textContent = `
  #fan-launcher{position:fixed;right:12px;top:12px;z-index:1005;background:#243e35ef;color:#eef5dd;border:1px solid #718b60;border-radius:7px;padding:9px 15px;font:600 12px system-ui;cursor:pointer}
  #fan-collection{position:fixed;inset:0;z-index:2000;background:#102a24bf;backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:25px;font:13px/1.6 system-ui;color:#294337;text-align:left;box-sizing:border-box}
  #fan-collection *{box-sizing:border-box}#fan-collection .fan-panel{width:1040px;max-width:100%;max-height:92vh;overflow:auto;background:#f7f9ef;border:1px solid #cad6bb;border-radius:16px;box-shadow:0 20px 90px #071a1544;padding:30px}
  #fan-collection h1{font:600 28px/1.3 system-ui;margin:0 0 8px;letter-spacing:-1px}#fan-collection h2{font:600 18px system-ui;margin:10px 0}#fan-collection p{font:12px/1.8 system-ui;color:#87967a;margin:8px 0 17px}#fan-collection .fan-eyebrow{font:600 9px system-ui;letter-spacing:2px;color:#93a17e;margin-bottom:12px}#fan-collection .fan-head{display:flex;justify-content:space-between;gap:15px;align-items:center;margin-bottom:22px}
  #fan-collection button{background:#fff;border:1px solid #d4dfc7;border-radius:7px;padding:10px 15px;color:#5d7750;font:600 11px system-ui;cursor:pointer;transition:background .2s,transform .2s}#fan-collection button:hover{background:#eaf1dc;transform:translateY(-1px)}#fan-collection button:focus-visible,#fan-collection input:focus-visible,#fan-collection select:focus-visible{outline:3px solid #9bb879;outline-offset:3px}#fan-collection button:disabled{opacity:.4;cursor:not-allowed}#fan-collection .fan-primary{background:#3b6346;border-color:#3b6346;color:white}#fan-collection .fan-danger{background:#fdf2e8;border-color:#e6cdb7;color:#b58362}
  #fan-collection .fan-tools{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}#fan-collection input,#fan-collection select{background:white;border:1px solid #d9e2ce;padding:10px 12px;border-radius:7px;color:#657d56;font:12px system-ui;min-width:0}#fan-collection input{flex:1;min-width:160px}
  #fan-collection .fan-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}#fan-collection .fan-card{position:relative;padding:13px 8px;display:flex;flex-direction:column;align-items:center;min-height:142px;gap:5px;background:#fff;color:#35513b}#fan-collection .fan-card img{width:96px;height:64px;object-fit:contain;image-rendering:pixelated;max-width:100%}#fan-collection .fan-card small{font-size:9px;color:#a1ad92;font-weight:400}#fan-collection .fan-card strong{font-size:11px}#fan-collection .fan-card.fan-picked{border:2px solid #91b367;background:#f0f7e4}#fan-collection .fan-card.fan-shiny{background:#faf4e0}#fan-collection .fan-team{display:flex;gap:10px;flex-wrap:wrap;margin:15px 0}#fan-collection .fan-team>span{padding:7px 11px;background:#e7efdb;border-radius:6px;font-size:10px;color:#7c9367}
  #fan-collection .fan-wallet{display:flex;gap:12px;margin:16px 0;flex-wrap:wrap}#fan-collection .fan-wallet>div{padding:13px 18px;background:#edf2e3;border-radius:8px;min-width:120px}#fan-collection .fan-wallet strong{display:block;font-size:22px;color:#6c8755}#fan-collection .fan-wallet small{font-size:8px;color:#9aab85;letter-spacing:1px}
  #fan-collection .fan-record{display:grid;grid-template-columns:200px 1fr;gap:25px}#fan-collection .fan-portrait{background:#eaf1dd;border:1px solid #dbe7ca;border-radius:10px;padding:25px 16px;text-align:center}#fan-collection .fan-portrait img{width:160px;height:120px;object-fit:contain;image-rendering:pixelated}#fan-collection .fan-stats{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}#fan-collection .fan-stats>div{padding:10px;background:#edf3e3;border-radius:6px;text-align:center}#fan-collection .fan-stats strong{display:block;font-size:17px}#fan-collection .fan-stats small{font-size:8px;color:#94a47d}#fan-collection .fan-detail{padding:15px 0;border-bottom:1px solid #e2ead7;font-size:11px}#fan-collection .fan-detail span{color:#91a17e;display:block;font-size:9px;letter-spacing:.5px;margin-bottom:4px}#fan-collection .fan-id{font:10px ui-monospace,monospace;word-break:break-all}#fan-collection .fan-note{padding:12px 15px;background:#f2edda;border:1px solid #e6ddba;color:#a3915e;border-radius:7px;font-size:10px;margin:16px 0}#fan-collection .fan-empty{min-height:120px;border-style:dashed;background:transparent;color:#c2ceb1}#fan-collection .fan-footer{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-top:22px;padding-top:18px;border-top:1px solid #dfe7d3;font-size:10px;color:#a3b18f}#fan-collection .fan-start-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:28px 0}#fan-collection .fan-start-grid button{padding:30px 15px;font-size:17px}#fan-collection .fan-start-grid img{display:block;margin:0 auto 20px;width:120px;height:90px;object-fit:contain;image-rendering:pixelated}
  @media(max-width:760px){#fan-collection{padding:10px}#fan-collection .fan-panel{padding:21px;max-height:96vh;border-radius:10px}#fan-collection .fan-grid{grid-template-columns:repeat(3,1fr);gap:9px}#fan-collection h1{font-size:23px}#fan-collection .fan-head{align-items:flex-start}#fan-collection .fan-card{padding:10px 5px;min-height:130px}#fan-collection .fan-card img{width:85px;height:58px}#fan-collection .fan-card strong{font-size:10px}#fan-collection .fan-card small{font-size:8px}#fan-collection .fan-record{grid-template-columns:1fr;gap:16px}#fan-collection .fan-portrait{padding:10px}#fan-collection .fan-portrait img{height:85px;width:120px}#fan-collection .fan-stats{grid-template-columns:repeat(3,1fr)}#fan-collection .fan-start-grid{gap:9px}#fan-collection .fan-start-grid button{padding:18px 5px;font-size:12px}#fan-collection .fan-start-grid img{width:90px;height:70px;max-width:100%}#fan-collection .fan-footer{align-items:flex-start;flex-wrap:wrap}#fan-launcher{top:5px;right:6px;font-size:10px;padding:7px 10px}}
  `;
  document.head.append(style);
}
function overlay(): { root: HTMLElement; panel: HTMLElement; close: () => void } {
  styles();
  document.getElementById("fan-collection")?.remove();
  const root = el("div"); root.id = "fan-collection";
  root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Permanent Pokémon collection");
  const panel = el("section", undefined, "fan-panel"); root.append(panel);
  const previousFocus = document.activeElement as HTMLElement | null;
  const wasEnabled = globalScene?.input?.enabled;
  if (globalScene?.input) globalScene.input.enabled = false;
  const keyboard = (event: KeyboardEvent): void => {
    event.stopImmediatePropagation();
    if (event.key === "Escape") { event.preventDefault(); root.querySelector<HTMLButtonElement>("[data-fan-close]")?.click(); }
    if (event.key === "Tab") {
      const controls = Array.from(root.querySelectorAll<HTMLElement>("button:not(:disabled), input, select"));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  window.addEventListener("keydown", keyboard, true);
  document.body.append(root);
  return { root, panel, close: () => { root.remove(); window.removeEventListener("keydown", keyboard, true); if (globalScene?.input && wasEnabled !== undefined) globalScene.input.enabled = wasEnabled; previousFocus?.focus(); } };
}
function description(panel: HTMLElement, title: string, subtitle: string): void {
  panel.append(el("div", "PERMANENT COMPANIONS · POKÉROGUE FAN BUILD", "fan-eyebrow"), el("h1", title), el("p", subtitle));
}
export async function chooseOwnedTeam(): Promise<TeamSelection | null> {
  const save = await collectionTransaction();
  return new Promise(resolve => {
    const view = overlay();
    const cancel = button("Back to title", () => { view.close(); resolve(null); }); cancel.dataset.fanClose = "true";
    view.panel.append(cancel);
    if (!save.starterChosen && save.records.length === 0) {
      description(view.panel, "Choose your first companion", "One starter. One unique individual. Every future team uses Pokémon you actually own — not species unlocks.");
      const grid = el("div", undefined, "fan-start-grid");
      for (const id of [1,4,7]) {
        const pick = button(speciesDataRegistry.getSpecies(id).getName(), () => { view.close(); resolve({ starter: id }); });
        pick.prepend(sprite(id)); grid.append(pick);
      }
      view.panel.append(grid, el("p", "Your starter's IVs, nature, gender, and ability are generated by the native PokéRogue engine. Its identity is saved permanently."));
    } else {
      description(view.panel, "Choose your owned adventure team", "Select up to six individuals. Duplicate species stay separate. Native battles, moves, abilities, evolution, and Mega mechanics remain intact.");
      const selected = new Set(save.records.filter(r => r.location === "party").slice(0,6).map(r => r.id));
      if (!selected.size && save.records[0]) selected.add(save.records[0].id);
      const count = el("p");
      const begin = button("Start with this team", () => { view.close(); resolve({ records: save.records.filter(r => selected.has(r.id)) }); }, "fan-primary");
      const grid = el("div", undefined, "fan-grid");
      const render = (): void => {
        count.textContent = `${selected.size} / 6 individuals selected. Your owned levels and attributes are preserved; HP and PP recover when a new run begins.`;
        begin.disabled = selected.size === 0;
        grid.replaceChildren();
        for (const record of save.records) {
          const pick = button("", () => { if (selected.has(record.id)) selected.delete(record.id); else if (selected.size < 6) selected.add(record.id); render(); }, `fan-card ${selected.has(record.id) ? "fan-picked" : ""}`);
          pick.append(sprite(record.data.species, record.data.shiny), el("strong", name(record)), el("small", `Lv. ${record.data.level} · ${record.id.slice(0,8)}`)); grid.append(pick);
        }
      };
      render(); view.panel.append(count, begin, el("p", "This is an owned-party selector, not the original starter-unlock menu."), grid);
    }
    cancel.focus();
  });
}
export async function showCollection(): Promise<void> {
  let save = await collectionTransaction();
  const view = overlay();
  let location: OwnedRecord["location"] = "pc", box = 0, query = "", filter = "all", sort = "date", moving: string | null = null;
  const currentPhase = globalScene?.phaseManager?.getCurrentPhase()?.phaseName;
  const canOrganize = currentPhase === "TitlePhase" || currentPhase === "SelectStarterPhase";
  async function change(fn: (data: CollectionSave) => void): Promise<void> { save = await collectionTransaction(fn); render(); }
  const render = (): void => {
    view.panel.replaceChildren();
    const header = el("div", undefined, "fan-head"), heading = el("div");
    description(heading, location === "home" ? "Pokémon HOME · collection" : "Permanent Pokémon PC", `${save.records.length} owned individuals · ${new Set(save.records.map(r => r.data.species)).size} unique species · Original PokéRogue battle engine`);
    const close = button("Return to game", view.close); close.dataset.fanClose = "true"; header.append(heading, close); view.panel.append(header);
    const wallet = el("div", undefined, "fan-wallet");
    for (const [title, value] of [["STARDUST", save.stardust],["INDIVIDUALS",save.records.length],["SHINY",save.records.filter(r => r.data.shiny).length]] as const) { const cell = el("div"); cell.append(el("small",title),el("strong",`${value}`)); wallet.append(cell); }
    view.panel.append(wallet);
    const toolbar = el("div", undefined, "fan-tools");
    for (const loc of ["party","pc","home"] as const) toolbar.append(button(loc === "home" ? "HOME storage" : loc === "pc" ? "PC boxes" : "Adventure party", () => { location = loc; render(); }, location === loc ? "fan-primary" : ""));
    const search = el("input"); search.type = "search"; search.placeholder = "Search species, nickname, or individual ID"; search.value = query; search.setAttribute("aria-label", "Search permanent collection");
    search.onchange = () => { query = search.value; render(); };
    const filters = el("select"); filters.setAttribute("aria-label", "Collection filter");
    for (const [value,text] of [["all","All companions"],["shiny","Shiny only"],["favorite","Favorites"],["locked","Locked"]]) { const option = el("option",text); option.value = value; filters.append(option); }
    filters.value = filter; filters.onchange = () => { filter = filters.value; render(); };
    const sorting = el("select"); sorting.setAttribute("aria-label", "Sort collection");
    for (const [value,text] of [["date","Recent captures"],["level","Highest level"],["iv","Best IVs"],["species","Species number"]]) { const option = el("option",text); option.value = value; sorting.append(option); }
    sorting.value = sort; sorting.onchange = () => { sort = sorting.value; render(); };
    toolbar.append(search,filters,sorting); view.panel.append(toolbar);
    if (!canOrganize) view.panel.append(el("div", "Battle is paused while this panel is open. Browse summaries, favorites, and locks here. Organize or release companions from the title screen; current-run parties are never silently changed.", "fan-note"));
    if (location !== "party") {
      const boxes = el("div", undefined, "fan-tools");
      const select = el("select"); select.setAttribute("aria-label", "Storage box");
      for (const b of save.boxes) { const option = el("option", b.name); option.value = `${b.id}`; select.append(option); }
      select.value = `${box}`; select.onchange = () => { box = +select.value; render(); };
      boxes.append(select, button("Rename box", async () => { const title = window.prompt("Box name",save.boxes[box].name)?.trim(); if (title && title.length <= 24) await change(data => { data.boxes[box].name = title; }); }));
      view.panel.append(boxes);
    }
    if (moving) view.panel.append(el("div", "Choose an empty slot or another companion to swap. Change PC/HOME/Party tabs to move between locations.", "fan-note"));
    const grid = el("div", undefined, "fan-grid");
    const iv = (r:OwnedRecord):number => Math.round(r.data.ivs.reduce((a,b)=>a+b,0)/186*100);
    const visible = save.records.filter(r => (!query || `${name(r)} ${r.id}`.toLowerCase().includes(query.toLowerCase())) && (filter === "all" || filter === "shiny" && r.data.shiny || filter === "favorite" && r.favorite || filter === "locked" && r.locked)).sort((a,b)=>sort === "level" ? b.data.level-a.data.level : sort === "iv" ? iv(b)-iv(a) : sort === "species" ? a.data.species-b.data.species : b.capturedAt.localeCompare(a.capturedAt));
    const filtered = !!query || filter !== "all" || sort !== "date";
    const renderRecord = (record: OwnedRecord): HTMLElement => {
      const card = button("", async () => { if (moving && moving !== record.id && canOrganize) { await change(data => moveRecord(data,moving!,record.location,record.box,record.slot)); moving=null; render(); } else summary(record); }, `fan-card ${record.data.shiny?"fan-shiny":""} ${moving===record.id?"fan-picked":""}`);
      card.draggable = canOrganize;
      card.ondragstart = event => { event.dataTransfer?.setData("text/plain",record.id); };
      card.ondragover = event => event.preventDefault();
      card.ondrop = event => { event.preventDefault(); const id = event.dataTransfer?.getData("text/plain"); if (id && canOrganize) void change(data => moveRecord(data,id,record.location,record.box,record.slot)); };
      card.append(sprite(record.data.species,record.data.shiny),el("strong",`${record.favorite?"♥ ":""}${name(record)}${record.locked?" · locked":""}`),el("small",`Lv. ${record.data.level} · ${iv(record)}% IV${record.data.shiny?" · ✦":""}`),el("small",`${record.location.toUpperCase()} · ${record.id.slice(0,8)}`));
      return card;
    };
    if (filtered) for (const record of visible) grid.append(renderRecord(record));
    else for (let slot = 0; slot < (location === "party" ? 6 : 30); slot++) {
      const record = visible.find(r => r.location === location && r.box === (location === "party"?0:box) && r.slot === slot);
      if (record) grid.append(renderRecord(record));
      else {
        const empty = button(`+ Slot ${slot+1}`, async () => { if (moving && canOrganize) { await change(data => moveRecord(data,moving!,location,location === "party"?0:box,slot));moving=null;render(); } }, "fan-empty");
        empty.ondragover = event => event.preventDefault();
        empty.ondrop = event => { event.preventDefault();const id=event.dataTransfer?.getData("text/plain");if(id&&canOrganize)void change(data=>moveRecord(data,id,location,location==="party"?0:box,slot)); };
        grid.append(empty);
      }
    }
    view.panel.append(grid);
    const footer = el("div",undefined,"fan-footer");
    footer.append(el("span",`Local collection · revision ${save.revision} · clearing site data deletes local saves`),button("Export collection backup",()=>{
      const blob=new Blob([JSON.stringify(save,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),link=el("a");link.href=url;link.download="pokerogue-individual-collection.json";link.click();URL.revokeObjectURL(url);
    }));
    view.panel.append(footer);
  };
  const summary = (record:OwnedRecord):void => {
    view.panel.replaceChildren();
    const back=button("← Back to collection",render);view.panel.append(back);
    const close=button("Return to game",view.close);close.dataset.fanClose="true";view.panel.append(close);
    const layout=el("div",undefined,"fan-record"),portrait=el("div",undefined,"fan-portrait"),detail=el("div");
    portrait.append(sprite(record.data.species,record.data.shiny),el("h2",name(record)),el("p",`Level ${record.data.level}${record.data.shiny?" · Shiny":""}`),el("div",record.id,"fan-id"));
    const native=new PokemonData(record.data),row=(title:string,value:string):void=>{const node=el("div",undefined,"fan-detail");node.append(el("span",title),document.createTextNode(value));detail.append(node);};
    const stats=el("div",undefined,"fan-stats");["HP","ATK","DEF","SPA","SPD","SPE"].forEach((title,i)=>{const cell=el("div");cell.append(el("small",title),el("strong",`${record.data.stats[i]??"—"}`),el("small",`IV ${record.data.ivs[i]}`));stats.append(cell);});detail.append(stats);
    row("ORIGINAL TRAINER / CAPTURE DATE",`${record.originalTrainer} · ${new Date(record.capturedAt).toLocaleString()}`);
    row("MOVES / PP USED",native.moveset.map(m=>`${m.getName()} (${m.ppUsed} PP used)`).join(" · "));
    row("NATURE / ABILITY / PASSIVE",`Native nature #${native.nature} · ability slot ${native.abilityIndex+1} · passive ${native.passive?"unlocked":"locked"}. Full ability and move details remain available in the native party summary.`);
    row("FAMILY CANDY",`${save.candy[record.family]??0} shared candy · captures award 3, shiny captures 6, transfers 1.`);
    row("STORAGE",`${record.location.toUpperCase()} · box ${record.box+1} · slot ${record.slot+1}`);
    const actions=el("div",undefined,"fan-tools");
    actions.append(button(record.favorite?"♥ Favorited":"♡ Favorite",async()=>{await change(data=>{data.records.find(r=>r.id===record.id)!.favorite=!record.favorite;});summary(save.records.find(r=>r.id===record.id)!);}),button(record.locked?"Unlock transfer":"Lock against transfer",async()=>{await change(data=>{data.records.find(r=>r.id===record.id)!.locked=!record.locked;});summary(save.records.find(r=>r.id===record.id)!);}));
    const organize=button("Move / swap this individual",()=>{moving=record.id;render();});organize.disabled=!canOrganize;actions.append(organize);
    const release=button("Transfer to professor (+1 candy)",async()=>{
      if(!window.confirm(`Permanently release ${name(record)} (${record.id.slice(0,8)})? This cannot be undone.`))return;
      await change(data=>{const current=data.records.find(r=>r.id===record.id);if(!current||current.locked||current.favorite)throw new Error("Unlock and unfavorite this companion before transferring.");if(data.records.length<=1)throw new Error("You cannot transfer your last companion.");data.records=data.records.filter(r=>r.id!==record.id);data.candy[record.family]=(data.candy[record.family]??0)+1;});
    },"fan-danger");release.disabled=!canOrganize||record.favorite||record.locked||save.records.length<=1;actions.append(release);detail.append(actions);layout.append(portrait,detail);view.panel.append(layout);back.focus();
  };
  render();view.panel.querySelector<HTMLButtonElement>("[data-fan-close]")?.focus();
}
export function installCollectionLauncher():void {
  if(!individualOwnershipEnabled||document.getElementById("fan-launcher"))return;
  styles();const launch=button("PC / HOME",showCollection);launch.id="fan-launcher";launch.setAttribute("aria-label","Open permanent Pokémon PC and HOME collection");document.body.append(launch);
}
