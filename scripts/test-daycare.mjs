import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {handleDaycare} from "../server/daycare.mjs";
import {handleAccounts} from "../server/accounts.mjs";
import {readCloudSave} from "../server/save-store.mjs";
import {planBreeding,formatDaycareTime} from "../standalone-public/breeding-rules.js";
import catalog from "../server/species-breeding.json" with {type:"json"};
const schema=await readFile(new URL("../server/schema.sql",import.meta.url),"utf8");
const NOW=1800000000000;
async function fixture() {
  const sql=new DatabaseSync(":memory:");sql.exec(schema);
  let tail=Promise.resolve();
  const db={prepare(query) {
    const stmt=sql.prepare(query);let values=[];
    return {bind(...args){values=args;return this;},async first(){return stmt.get(...values)??null;},
      async all(){return {results:stmt.all(...values)};},
      async run(){const r=stmt.run(...values);return {meta:{changes:Number(r.changes)}};}};
  },batch(statements) {
    const task=tail.then(async()=>{
      sql.exec("BEGIN");
      try{const results=[];for(const stmt of statements)results.push(await stmt.run());sql.exec("COMMIT");return results;}
      catch(error){sql.exec("ROLLBACK");throw error;}
    });tail=task.catch(()=>{});return task;
  }};
  const user={id:crypto.randomUUID(),username:"DaycareTester"};
  sql.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run(user.id,user.username,user.username.toLowerCase(),"salt","hash",1);
  const parent=(species,gender)=>({id:crypto.randomUUID(),family:catalog[species].root,originalTrainer:"test",capturedAt:new Date(NOW).toISOString(),location:"pc",box:0,slot:0,favorite:false,locked:false,
    data:{species,gender,level:50,ivs:[31,30,29,28,27,26],shiny:false,fusionSpecies:0}});
  const records=[parent(1,1),parent(2,0),parent(132,-1),parent(150,-1),parent(16,0)];
  records.forEach((r,i)=>r.slot=i);
  const save={local:{data:"original-native-eggs-and-vouchers",sessionData:"original-run"},collection:{schema:1,starterChosen:true,revision:4,records,candy:{1:10},stardust:200,boxes:[{id:0,name:"Original Box",background:"forest"}],transfers:[]}};
  sql.prepare("INSERT INTO saves VALUES (?,1,?,?)").run(user.id,JSON.stringify(save),NOW);
  let revision=0;
  async function call(action,details={},now=NOW,requestId=crypto.randomUUID(),expected=revision) {
    const result=await handleDaycare(action?`daycare/${action}`:"daycare",new Request("https://test.invalid",{method:action?"POST":"GET"}),user,db,action?{...details,userId:user.id,revision:expected,requestId}:null,now);
    if(result.data.revision!==undefined)revision=result.data.revision;
    return {status:result.status||200,...result.data};
  }
  function balance(gems){const row=sql.prepare("SELECT state FROM daycare_states WHERE user_id=?").get(user.id);const state=JSON.parse(row.state);state.gems=gems;sql.prepare("UPDATE daycare_states SET state=? WHERE user_id=?").run(JSON.stringify(state),user.id);}
  await call("");
  return {sql,db,user,records,save,call,balance};
}
test("additive migration preserves native saves, eggs, vouchers and ownership",async()=>{
  const f=await fixture();f.sql.exec(schema);
  assert.deepEqual((await readCloudSave(f.db,f.user.id)).save,f.save);
  const view=await f.call("");assert.equal(view.state.gems,30);assert.equal(view.state.slots,1);
  assert.equal((await f.call("")).state.gems,30);
});
test("catalog has 1025 species and validates real egg groups, genders and Ditto",async()=>{
  const f=await fixture(),[female,male,ditto,legend,bird]=f.records;
  assert.equal(Object.keys(catalog).length,1025);
  assert.equal(planBreeding(female,male,catalog).species,1);
  assert.equal(planBreeding(male,ditto,catalog).species,1);
  assert.equal(planBreeding(legend,ditto,catalog).species,150);
  assert.throws(()=>planBreeding(female,female,catalog),/different individuals/);
  assert.throws(()=>planBreeding(female,bird,catalog),/egg group/);
  assert.throws(()=>planBreeding(legend,male,catalog),/needs Ditto/);
  assert.throws(()=>planBreeding(ditto,{...ditto,id:"other"},catalog),/Two Ditto/);
  assert.throws(()=>planBreeding({...female,data:{...female.data,species:172}},ditto,catalog),/cannot breed/);
});
test("daily Gems use a rolling server-owned 24 hours and idempotent receipts",async()=>{
  const f=await fixture(),id=crypto.randomUUID();
  let result=await f.call("daily",{},NOW,id);
  assert.equal(result.state.gems,40);assert.equal(result.state.dailyNextAt,NOW+86400000);
  result=await f.call("daily",{},NOW+1000,id,0);
  assert.equal(result.replayed,true);assert.equal(result.state.gems,40);
  assert.equal((await f.call("daily",{now:NOW+999999999},NOW+86399999)).status,400);
  assert.equal((await f.call("daily",{},NOW+86400000)).state.gems,50);
});
test("slot prices are permanent, bounded and never spend unowned Gems",async()=>{
  const f=await fixture();
  let result=await f.call("slot");
  assert.equal(result.state.slots,2);assert.equal(result.state.gems,5);
  assert.equal((await f.call("slot")).status,400);
  f.balance(1000);
  for(let i=0;i<4;i++)result=await f.call("slot");
  assert.equal(result.state.slots,6);assert.equal((await f.call("slot")).status,400);
  assert.equal((await f.call("")).state.gems,result.state.gems);
});
test("concurrent purchases cannot double charge or bypass revision guards",async()=>{
  const f=await fixture();f.balance(1000);
  const results=await Promise.all([f.call("slot",{},NOW,crypto.randomUUID(),0),f.call("slot",{},NOW,crypto.randomUUID(),0)]);
  assert.equal(results.filter(r=>r.status===200).length,1);
  assert.equal(results.filter(r=>r.status===409).length,1);
  assert.equal((await f.call("")).state.gems,975);assert.equal((await f.call("")).state.slots,2);
});
test("breeding previews are revalidated against owned cloud parents; parents remain unchanged",async()=>{
  const f=await fixture();
  const result=await f.call("breed",{parentA:f.records[0].id,parentB:f.records[1].id});
  assert.equal(result.status,200);assert.equal(result.state.gems,25);assert.equal(result.state.eggs[0].species,1);
  assert.equal(result.state.eggs[0].battles,10);
  assert.deepEqual((await readCloudSave(f.db,f.user.id)).save,f.save);
  assert.equal((await f.call("breed",{parentA:"not-owned",parentB:f.records[2].id})).status,400);
  assert.equal((await f.call("breed",{parentA:f.records[0].id,parentB:f.records[1].id})).status,400);
});
test("legendary cooldown is shared across slots, starts at egg creation and survives reconnect",async()=>{
  const f=await fixture();f.balance(1000);await f.call("slot");
  const id=crypto.randomUUID(),details={parentA:f.records[3].id,parentB:f.records[2].id};
  let result=await f.call("breed",details,NOW,id);
  assert.equal(result.state.legendaryNextAt,NOW+86400000);assert.equal(result.state.eggs[0].species,150);
  assert.equal((await f.call("breed",details,NOW+86399999)).status,400);
  result=await f.call("breed",details,NOW+1000,id);
  assert.equal(result.replayed,true);assert.equal(result.state.eggs.length,1);
  result=await f.call("breed",details,NOW+86400000);
  assert.equal(result.state.eggs.length,2);assert.equal(result.state.legendaryNextAt,NOW+2*86400000);
});
test("victory IDs are deduplicated, reward Gems and advance eggs, not wall-clock time",async()=>{
  const f=await fixture();
  let result=await f.call("breed",{parentA:f.records[0].id,parentB:f.records[1].id});
  const egg=result.state.eggs[0];
  assert.equal((await f.call("hatch",{eggId:egg.id},NOW+30*86400000)).status,400);
  for(let i=1;i<=20;i++)result=await f.call("battle",{eventId:`run-seed:${i}`},NOW+i);
  assert.equal(result.state.totalBattles,20);assert.equal(result.state.gems,29);
  result=await f.call("battle",{eventId:"run-seed:1"},NOW+30);
  assert.equal(result.duplicate,true);assert.equal(result.state.totalBattles,20);
  result=await f.call("task",{},NOW+40);assert.equal(result.state.gems,39);
  assert.equal((await f.call("task",{},NOW+50)).status,400);
});
test("hatching atomically creates a unique PC child and retains native eggs/vouchers",async()=>{
  const f=await fixture();
  let result=await f.call("breed",{parentA:f.records[0].id,parentB:f.records[1].id});
  const egg=result.state.eggs[0],requestId=crypto.randomUUID();
  for(let i=1;i<=10;i++)await f.call("battle",{eventId:`hatch-run:${i}`},NOW+i);
  result=await f.call("hatch",{eggId:egg.id},NOW+100,requestId);
  assert.equal(result.state.eggs.length,0);assert.equal(result.cloud.revision,2);
  const child=result.cloud.save.collection.records.find(r=>r.id===egg.ownershipId);
  assert(child);assert.equal(child.location,"pc");assert.equal(child.data.level,5);assert.equal(child.data.daycareBlueprint,true);
  assert(child.data.ivs.every(iv=>iv>=0&&iv<=31));
  assert.deepEqual(result.cloud.save.local,f.save.local);
  assert.deepEqual(result.cloud.save.collection.records.slice(0,5),f.save.collection.records);
  assert.equal((await f.call("hatch",{eggId:egg.id},NOW+200,requestId)).cloud.save.collection.records.length,6);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM daycare_grants").get().n,1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM save_backups").get().n,1);
});
test("stale game restores cannot remove hatched Pokémon or roll back Gems/cooldowns",async()=>{
  const f=await fixture();
  let result=await f.call("breed",{parentA:f.records[0].id,parentB:f.records[1].id});
  const egg=result.state.eggs[0];
  for(let i=1;i<=10;i++)await f.call("battle",{eventId:`restore-run:${i}`},NOW+i);
  result=await f.call("hatch",{eggId:egg.id},NOW+100);
  const before=structuredClone(result.state),token="a".repeat(64);
  const digest=Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))).toString("hex");
  f.sql.prepare("INSERT INTO sessions VALUES (?,?,?)").run(digest,f.user.id,9999999999);
  const req=new Request("https://test.invalid/api/fan/save",{method:"PUT",headers:{"Content-Type":"application/json",Origin:"https://test.invalid",Cookie:`__Host-pokerogue_session=${token}`},
    body:JSON.stringify({userId:f.user.id,revision:result.cloud.revision,save:f.save})});
  const response=await handleAccounts(req,{ACCOUNTS:f.db});
  assert.equal(response.status,200);
  assert((await readCloudSave(f.db,f.user.id)).save.collection.records.some(r=>r.id===egg.ownershipId));
  assert.deepEqual((await f.call("",{},NOW+100)).state,before);
});
test("failed hatch transactions retain the egg and never partially grant a child",async()=>{
  const f=await fixture();
  const result=await f.call("breed",{parentA:f.records[0].id,parentB:f.records[1].id}),egg=result.state.eggs[0];
  for(let i=1;i<=10;i++)await f.call("battle",{eventId:`failure-run:${i}`},NOW+i);
  const original=f.db.batch.bind(f.db);
  f.db.batch=statements=>original([...statements,f.db.prepare("INSERT INTO transaction_guards(id,ok) VALUES ('force-test-failure',0)")]);
  const response=await f.call("hatch",{eggId:egg.id},NOW+100);
  assert.equal(response.status,409);
  assert.equal((await f.call("")).state.eggs.length,1);
  assert.equal((await readCloudSave(f.db,f.user.id)).revision,1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM daycare_grants").get().n,0);
});
test("the timer displays real elapsed duration without midnight resets",()=>{
  assert.equal(formatDaycareTime(86400000),"24h 00m 00s");
  assert.equal(formatDaycareTime(3723000),"01h 02m 03s");
  assert.equal(formatDaycareTime(-1),"00h 00m 00s");
});
