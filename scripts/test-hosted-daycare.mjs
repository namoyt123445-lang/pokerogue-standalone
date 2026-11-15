import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
const origin=new URL(process.argv[2]).origin;
if(!origin.endsWith(".pokerogue-standalone.pages.dev"))throw new Error("Use this project's preview hostname.");
let cookie,user,revision=0;
async function request(path,method="GET",data) {
  const response=await fetch(`${origin}/api/fan/${path}`,{method,headers:{Origin:origin,"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},
    body:data===undefined?undefined:JSON.stringify(data)});
  const result=await response.json();
  if(response.headers.get("set-cookie"))cookie=response.headers.get("set-cookie").split(";")[0];
  return {status:response.status,...result};
}
async function action(kind,details={},id=crypto.randomUUID()) {
  const result=await request(`daycare/${kind}`,"POST",{...details,userId:user.id,revision,requestId:id});
  if(result.revision!==undefined)revision=result.revision;
  return result;
}
const username=`qa_daycare_${randomBytes(4).toString("hex")}`;
try {
  assert.equal((await request("daycare")).status,401);
  const registered=await request("register","POST",{username,password:randomBytes(24).toString("hex")});
  assert.equal(registered.status,200,JSON.stringify(registered));user=registered.user;
  const parent=(species,gender,slot)=>({id:crypto.randomUUID(),family:species,originalTrainer:username,capturedAt:new Date().toISOString(),location:"pc",box:0,slot,favorite:false,locked:false,
    data:{id:slot+1,species,gender,player:true,formIndex:0,level:5,ivs:[31,30,29,28,27,26],shiny:false,fusionSpecies:0}});
  const parents=[parent(1,1,0),parent(1,0,1),parent(132,-1,2),parent(150,-1,3)];
  const save={local:{data:"qa-original-eggs-vouchers",sessionData:"qa-original-run"},collection:{schema:1,starterChosen:true,revision:0,records:parents,candy:{},stardust:0,boxes:[{id:0,name:"QA",background:"forest"}],transfers:[]}};
  assert.equal((await request("save","PUT",{userId:user.id,revision:0,save})).status,200);
  let result=await request("daycare");revision=result.revision;
  assert.equal(result.state.gems,30);assert.equal(result.state.slots,1);
  assert.equal(Object.keys((await request("daycare/catalog")).catalog).length,1025);
  result=await action("daily");assert.equal(result.state.gems,40);
  const legendaryRequest=crypto.randomUUID();
  result=await action("breed",{parentA:parents[3].id,parentB:parents[2].id},legendaryRequest);
  assert.equal(result.status,200,JSON.stringify(result));
  const legendaryEgg=result.state.eggs[0],nextAt=result.state.legendaryNextAt;
  assert(Math.abs(nextAt-result.serverNow-86400000)<10000);
  for(let i=1;i<=20;i++){result=await action("battle",{eventId:`hosted-qa:${i}`});assert.equal(result.status,200);}
  result=await action("task");assert.equal(result.state.gems,29);
  result=await action("slot");assert.equal(result.state.slots,2);assert.equal(result.state.gems,4);
  result=await action("breed",{parentA:parents[3].id,parentB:parents[2].id});
  assert.equal(result.status,400);assert.match(result.error,/24 real hours/);
  for(let i=21;i<=40;i++){result=await action("battle",{eventId:`hosted-qa:${i}`});assert.equal(result.status,200);}
  result=await action("hatch",{eggId:legendaryEgg.id});
  assert.equal(result.status,200,JSON.stringify(result));
  assert(result.cloud.save.collection.records.some(r=>r.id===legendaryEgg.ownershipId&&r.data.species===150&&r.location==="pc"));
  assert.deepEqual(result.cloud.save.local,save.local);
  result=await action("breed",{parentA:parents[0].id,parentB:parents[1].id});
  assert.equal(result.status,200);const egg=result.state.eggs[0];
  for(let i=41;i<=50;i++){result=await action("battle",{eventId:`hosted-qa:${i}`});assert.equal(result.status,200);}
  const hatchRequest=crypto.randomUUID();
  result=await action("hatch",{eggId:egg.id},hatchRequest);
  assert.equal(result.cloud.save.collection.records.length,6);const cloudRevision=result.cloud.revision;
  result=await action("hatch",{eggId:egg.id},hatchRequest);
  assert.equal(result.replayed,true);assert.equal(result.cloud.save.collection.records.length,6);
  result=await request("save","PUT",{userId:user.id,revision:cloudRevision,save});
  assert.equal(result.status,200);assert.equal(result.collection.records.length,6);
  const state=await request("daycare");
  assert.equal(state.state.legendaryNextAt,nextAt);assert.equal(state.state.slots,2);
  assert.equal(state.state.gems,5);assert.equal(state.state.totalBattles,50);
  assert((await request("save/backups")).backups.length>0);
  await request("logout","POST",{});
  assert.equal((await request("daycare")).status,401);
  console.log("Hosted Daycare checks passed: welcome/daily Gems, compatible and legendary breeding, slots, 24-hour gate, 50 deduplicated victories, both hatches, replay protection, preserved saves and backups.");
} finally {
  if(user)console.log("QA-only account to remove:",JSON.stringify(user));
}
