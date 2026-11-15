import {identify,getAccountUser,writeSnapshot} from "./cloud.js";
import {refreshDaycare,daycareAction,getDaycareStatus,daycareServerNow,flushDaycareBattles} from "./daycare-client.js";
import {planBreeding,formatDaycareTime} from "./breeding-rules.js";
import {api} from "./cloud.js";
const $=id=>document.getElementById(id);
let catalog={},busy=false,parentA="",parentB="";
function status(text,error=false){$("status").textContent=text;$("status").classList.toggle("error",error);}
async function withLock(fn) {
  const user=getAccountUser();if(!user)throw new Error("Log in to use the Daycare.");
  if(!navigator.locks)throw new Error("Use an up-to-date browser with Web Locks to manage your saves safely.");
  return navigator.locks.request(`fan-playing:${user.id}`,{ifAvailable:true},lock=>{
    if(!lock)throw new Error("Save and close the other game tab before managing the Daycare.");
    return fn();
  });
}
async function perform(fn) {
  if(busy)return;busy=true;renderButtons();
  try{await withLock(fn);status("Daycare saved securely.");}
  catch(error){status(error.message,true);try{await refreshDaycare();}catch{}}
  finally{busy=false;render();}
}
function parent(id){return getDaycareStatus()?.parents.find(p=>p.id===id);}
function preview() {
  const panel=$("preview");panel.classList.remove("incompatible");
  if(!parentA||!parentB){panel.textContent="Select two parents to preview compatibility, offspring and price.";return null;}
  try {
    const plan=planBreeding(parent(parentA),parent(parentB),catalog);
    panel.textContent=`${plan.name} egg · ${plan.cost} Gems · ${plan.battles} victories to hatch. Parents remain yours.${plan.legendary?" One legendary egg every 24 real hours; no exclusive quest is required.":""}`;
    return plan;
  } catch(error){panel.textContent=error.message;panel.classList.add("incompatible");return null;}
}
function renderButtons() {
  const data=getDaycareStatus();if(!data)return;
  const {state,rules}=data,now=daycareServerNow(),plan=preview();
  $("claim-daily").disabled=busy||now<state.dailyNextAt;
  const dailyExpired=now-state.daily.startedAt>=rules.cooldownMs;
  $("claim-task").disabled=busy||dailyExpired||state.daily.taskClaimed||state.daily.battles<rules.dailyTaskBattles;
  $("buy-slot").disabled=busy||state.slots>=rules.maxSlots||state.gems<(rules.slotPrices[state.slots-1]??Infinity);
  $("breed").disabled=busy||!plan||state.eggs.length>=state.slots||state.gems<plan.cost||(plan.legendary&&now<state.legendaryNextAt);
  document.querySelectorAll("[data-hatch]").forEach(button=>button.disabled=busy);
}
function tick() {
  const data=getDaycareStatus();if(!data)return;
  const {state,rules}=data,now=daycareServerNow();
  $("legendary-timer").textContent=now>=state.legendaryNextAt?"Ready for legendary breeding":formatDaycareTime(state.legendaryNextAt-now);
  $("daily-timer").textContent=now>=state.dailyNextAt?"Daily supply ready.":`Next daily supply: ${formatDaycareTime(state.dailyNextAt-now)}`;
  const expired=now-state.daily.startedAt>=rules.cooldownMs;
  $("task-progress").textContent=`Daily task: ${expired?0:Math.min(state.daily.battles,rules.dailyTaskBattles)}/${rules.dailyTaskBattles} victories${!expired&&state.daily.taskClaimed?" · Claimed":""}`;
  renderButtons();
}
function populateSelect(id,selected) {
  const select=$(id),query=$("parent-search").value.toLowerCase();
  const parents=getDaycareStatus().parents;
  const filtered=parents.filter(p=>`${p.name} ${p.id}`.toLowerCase().includes(query)).slice(0,200);
  const chosen=parents.find(p=>p.id===selected);if(chosen&&!filtered.some(p=>p.id===selected))filtered.unshift(chosen);
  select.replaceChildren(new Option("Choose an individual",""));
  for(const p of filtered)select.add(new Option(`${p.name}${p.shiny?" ★":""} · Lv.${p.level} · #${p.id.slice(0,8)}`,p.id));
  select.value=selected;
}
const portraitCache=new Map();
async function drawPortrait(id,record) {
  const canvas=$(id),context=canvas.getContext("2d"),species=record?.data.species;
  context.clearRect(0,0,128,128);canvas.dataset.species=String(species||"");
  if(!species||species>1025)return;
  try {
    if(!portraitCache.has(species))portraitCache.set(species,(async()=>{
      const response=await fetch(`/images/pokemon/${species}.json`);
      if(!response.ok)throw new Error("Portrait unavailable");
      const atlas=await response.json(),texture=atlas.textures[0],frame=texture.frames[0].frame;
      const image=new Image();image.src=`/images/pokemon/${species}.png`;await image.decode();
      return {image,frame};
    })());
    const {image,frame}=await portraitCache.get(species);
    if(canvas.dataset.species!==String(species))return;
    context.imageSmoothingEnabled=false;
    const size=Math.min(110/frame.w,110/frame.h);
    context.drawImage(image,frame.x,frame.y,frame.w,frame.h,(128-frame.w*size)/2,(128-frame.h*size)/2,frame.w*size,frame.h*size);
  }catch{/* Species name and compatibility remain available if art cannot load. */}
}
function render() {
  const data=getDaycareStatus();if(!data)return;
  const {state,rules}=data;
  $("center").hidden=false;$("login").hidden=true;
  $("gems").textContent=state.gems;$("slot-count").textContent=`${state.eggs.length} / ${state.slots}`;
  $("buy-slot").textContent=state.slots>=rules.maxSlots?"All slots unlocked":`Unlock slot ${state.slots+1} · ${rules.slotPrices[state.slots-1]} Gems`;
  populateSelect("parent-a",parentA);populateSelect("parent-b",parentB);
  void drawPortrait("portrait-a",parent(parentA));void drawPortrait("portrait-b",parent(parentB));
  $("eggs").replaceChildren();
  for(const egg of state.eggs) {
    const done=Math.min(egg.battles,Math.max(0,state.totalBattles-egg.createdBattle));
    const card=document.createElement("article");card.className=`egg-card${egg.legendary?" legendary":""}`;
    const icon=document.createElement("div");icon.className="egg-shape";icon.setAttribute("aria-hidden","true");
    const info=document.createElement("div"),title=document.createElement("h3"),text=document.createElement("p"),progress=document.createElement("progress");
    title.textContent=`${egg.name}${egg.legendary?" · Legendary":""}`;
    text.textContent=done>=egg.battles?"Ready to hatch into your PC!":`${done} / ${egg.battles} battle victories`;
    progress.max=egg.battles;progress.value=done;progress.setAttribute("aria-label",`${egg.name} egg progress`);
    info.append(title,text,progress);
    if(done>=egg.battles){const button=document.createElement("button");button.textContent="Hatch into PC";button.dataset.hatch=egg.id;
      button.onclick=()=>perform(async()=>{const result=await daycareAction("hatch",{eggId:egg.id});await writeSnapshot(result.cloud.save,result.cloud.revision);});info.append(button);}
    card.append(icon,info);$("eggs").append(card);
  }
  for(let i=state.eggs.length;i<state.slots;i++){const empty=document.createElement("div");empty.className="empty-slot";empty.textContent=`Slot ${i+1} · Ready for an egg`;$("eggs").append(empty);}
  $("battle-total").textContent=`${state.totalBattles} victories counted toward Daycare progress. Pending offline wins retry automatically when you reconnect.`;
  $("history").replaceChildren();
  for(const entry of state.history.slice(0,8)){const li=document.createElement("li");li.textContent=`${entry.note}${entry.gems?` · ${entry.gems>0?"+":""}${entry.gems} Gems`:""}`;$("history").append(li);}
  tick();
}
$("parent-a").onchange=()=>{parentA=$("parent-a").value;void drawPortrait("portrait-a",parent(parentA));renderButtons();};
$("parent-b").onchange=()=>{parentB=$("parent-b").value;void drawPortrait("portrait-b",parent(parentB));renderButtons();};
$("parent-search").oninput=()=>{populateSelect("parent-a",parentA);populateSelect("parent-b",parentB);};
$("claim-daily").onclick=()=>perform(()=>daycareAction("daily"));
$("claim-task").onclick=()=>perform(()=>daycareAction("task"));
$("buy-slot").onclick=()=>perform(async()=>{
  const {state,rules}=getDaycareStatus();
  if(confirm(`Unlock permanent Daycare slot ${state.slots+1} for ${rules.slotPrices[state.slots-1]} Gems?`))await daycareAction("slot");
});
$("breed").onclick=()=>perform(async()=>{
  const plan=preview();if(!plan)throw new Error("Choose compatible parents.");
  if(confirm(`Create a ${plan.name} egg for ${plan.cost} Gems? Both parents stay yours.${plan.legendary?" Your 24-hour legendary cooldown will begin.":""}`))
    await daycareAction("breed",{parentA,parentB});
});
try {
  if(!await identify()){$("login").hidden=false;status("Log in for server-protected Daycare progress.");}
  else {
    const result=await api("daycare/catalog");catalog=result.catalog;
    await refreshDaycare();await withLock(flushDaycareBattles);
    render();status("Your Daycare is ready. Existing eggs, vouchers and Pokémon are safe.");
    setInterval(tick,1000);
    setInterval(()=>{if(!busy)void refreshDaycare().then(render).catch(error=>status(`${error.message} Local saves are unchanged.`,true));},60000);
  }
} catch(error){status(error.message,true);}
