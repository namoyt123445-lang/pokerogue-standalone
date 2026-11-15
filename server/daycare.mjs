import BREEDING_SPECIES from "./species-breeding.json" with {type:"json"};
import { DAYCARE_RULES, planBreeding } from "../standalone-public/breeding-rules.js";
import { readCloudSave,packSave,appendGrant,saveBackupStatements,guardStatement } from "./save-store.mjs";

export function newDaycareState(now) {
  return {schema:1,gems:DAYCARE_RULES.welcomeGems,slots:1,totalBattles:0,
    legendaryNextAt:0,dailyNextAt:0,daily:{startedAt:now,battles:0,taskClaimed:false},eggs:[],history:[]};
}
async function daycareRow(db,userId,now) {
  await db.prepare("INSERT OR IGNORE INTO daycare_states(user_id,revision,state) VALUES (?,0,?)").bind(userId,JSON.stringify(newDaycareState(now))).run();
  return db.prepare("SELECT revision,state FROM daycare_states WHERE user_id=?").bind(userId).first();
}
function journal(state,now,note,delta=0) {
  state.history.unshift({at:now,note,gems:delta});
  state.history=state.history.slice(0,30);
}
function randomInt(max) {return crypto.getRandomValues(new Uint32Array(1))[0]%max;}
export function daycareOffspring(a,b,species,catalog,random=randomInt) {
  const ivs=Array.from({length:6},()=>random(32)),indices=[0,1,2,3,4,5];
  for(let i=0;i<3;i++) {
    const index=indices.splice(random(indices.length),1)[0],parent=random(2)?a:b;
    ivs[index]=Math.max(0,Math.min(31,Number(parent.data.ivs?.[index])||0));
  }
  const rate=catalog[species].genderRate;
  return {ivs,nature:random(25),gender:rate<0?-1:random(8)<rate?1:0,
    shiny:random(512)===0,abilityIndex:0};
}
export function daycareGrant(egg,user,now) {
  return {id:egg.ownershipId,family:BREEDING_SPECIES[egg.species].root,originalTrainer:user.username,
    capturedAt:new Date(now).toISOString(),location:"pc",box:0,slot:0,favorite:false,locked:false,
    data:{...egg.offspring,id:egg.pokemonId,ownershipId:egg.ownershipId,player:true,species:egg.species,
      level:5,exp:0,levelExp:0,formIndex:0,variant:0,passive:false,hp:1,stats:[],moveset:[],
      nickname:"",status:null,metLevel:5,metBiome:-1,metWave:0,metSpecies:egg.species,daycareBlueprint:true}};
}
async function daycareView(db,user,now) {
  const row=await daycareRow(db,user.id,now),cloud=await readCloudSave(db,user.id);
  const state=JSON.parse(row.state);
  if(now-state.daily.startedAt>=DAYCARE_RULES.cooldownMs) state.daily={startedAt:now,battles:0,taskClaimed:false};
  const parents=(cloud.save?.collection.records||[]).map(record=>({
    id:record.id,name:BREEDING_SPECIES[record.data.species]?.name||`Species ${record.data.species}`,
    data:{species:record.data.species,gender:record.data.gender,fusionSpecies:record.data.fusionSpecies||0},
    level:record.data.level,shiny:!!record.data.shiny,
  }));
  return {user,revision:row.revision,state,parents,serverNow:now,rules:DAYCARE_RULES};
}
export async function handleDaycare(path,request,user,db,input,now=Date.now()) {
  if(path==="daycare/catalog"&&request.method==="GET") return {data:{catalog:BREEDING_SPECIES}};
  if(path==="daycare"&&request.method==="GET") return {data:await daycareView(db,user,now)};
  if(!path.startsWith("daycare/")||request.method!=="POST") return {status:404,data:{error:"Not found."}};
  const action=path.slice(8);
  if(!["daily","task","slot","breed","hatch","battle"].includes(action)) return {status:404,data:{error:"Not found."}};
  if(!input||input.userId!==user.id) return {status:409,data:{error:"Account changed. Reload before continuing."}};
  if(!Number.isInteger(input.revision)||!/^[a-f0-9-]{36}$/.test(input.requestId||"")) return {status:400,data:{error:"Invalid daycare request."}};
  const receipt=await db.prepare("SELECT kind,receipt FROM daycare_requests WHERE user_id=? AND request_id=?").bind(user.id,input.requestId).first();
  if(receipt) {
    if(receipt.kind!==action) return {status:400,data:{error:"Request ID was already used for another action."}};
    const data=await daycareView(db,user,now);
    if(action==="hatch") data.cloud=await readCloudSave(db,user.id);
    return {data:{...data,replayed:true}};
  }
  const row=await daycareRow(db,user.id,now);
  if(row.revision!==input.revision) return {status:409,data:{error:"Daycare changed in another tab or device. Refresh and try again."}};
  const state=JSON.parse(row.state);
  if(now-state.daily.startedAt>=DAYCARE_RULES.cooldownMs) state.daily={startedAt:now,battles:0,taskClaimed:false};
  const cloud=await readCloudSave(db,user.id);
  let egg,grant,payload,eventId;
  try {
    if(action==="daily") {
      if(now<state.dailyNextAt) throw new Error("Your daily Gems are not ready yet.");
      state.gems+=DAYCARE_RULES.dailyGems;state.dailyNextAt=now+DAYCARE_RULES.cooldownMs;
      journal(state,now,"Daily Gems",DAYCARE_RULES.dailyGems);
    } else if(action==="task") {
      if(state.daily.battles<DAYCARE_RULES.dailyTaskBattles||state.daily.taskClaimed) throw new Error("Win 20 battles in this daily window, then claim once.");
      state.gems+=DAYCARE_RULES.dailyTaskGems;state.daily.taskClaimed=true;
      journal(state,now,"Daily battle task",DAYCARE_RULES.dailyTaskGems);
    } else if(action==="slot") {
      const cost=DAYCARE_RULES.slotPrices[state.slots-1];
      if(cost===undefined) throw new Error("All six permanent slots are unlocked.");
      if(state.gems<cost) throw new Error("Not enough Gems for this slot.");
      state.gems-=cost;state.slots++;journal(state,now,`Daycare slot ${state.slots}`,-cost);
    } else if(action==="breed") {
      if(!cloud.save) throw new Error("Save your collection to the cloud before choosing parents.");
      if(state.eggs.length>=state.slots) throw new Error("Your Daycare is full. Hatch an egg or unlock another slot.");
      const a=cloud.save.collection.records.find(r=>r.id===input.parentA);
      const b=cloud.save.collection.records.find(r=>r.id===input.parentB);
      const plan=planBreeding(a,b,BREEDING_SPECIES);
      if(plan.legendary&&now<state.legendaryNextAt) throw new Error("Legendary breeding is limited to one egg every 24 real hours.");
      if(state.gems<plan.cost) throw new Error("Not enough Gems for this breeding.");
      egg={id:crypto.randomUUID(),ownershipId:crypto.randomUUID(),pokemonId:randomInt(4294967296),
        parents:[a.id,b.id],...plan,createdAt:now,createdBattle:state.totalBattles,
        offspring:daycareOffspring(a,b,plan.species,BREEDING_SPECIES)};
      state.eggs.push(egg);state.gems-=plan.cost;
      if(plan.legendary) state.legendaryNextAt=now+DAYCARE_RULES.cooldownMs;
      journal(state,now,`${plan.name} egg created`,-plan.cost);
    } else if(action==="hatch") {
      egg=state.eggs.find(e=>e.id===input.eggId);
      if(!egg) throw new Error("That egg is no longer in your Daycare.");
      if(state.totalBattles-egg.createdBattle<egg.battles) throw new Error("This egg needs more battle victories before hatching.");
      if(!cloud.save) throw new Error("A cloud collection is required to receive this Pokémon.");
      grant=daycareGrant(egg,user,now);
      appendGrant(cloud.save,grant);cloud.save.collection.revision++;
      payload=await packSave(cloud.save);
      if(new TextEncoder().encode(payload).length>1800000) throw new Error("Cloud collection is too large. The egg has not been consumed.");
      state.eggs=state.eggs.filter(e=>e.id!==egg.id);
      journal(state,now,`${egg.name} hatched into PC`);
    } else if(action==="battle") {
      eventId=input.eventId;
      if(typeof eventId!=="string"||!eventId.length||eventId.length>160||/[\x00-\x1f]/.test(eventId)) throw new Error("Invalid battle event.");
      const seen=await db.prepare("SELECT event_id FROM daycare_battles WHERE user_id=? AND event_id=?").bind(user.id,eventId).first();
      if(seen) return {data:{...await daycareView(db,user,now),duplicate:true}};
      state.totalBattles++;state.daily.battles++;
      if(state.daily.battles<=DAYCARE_RULES.rewardedBattlesPerDay&&state.daily.battles%DAYCARE_RULES.battleRewardEvery===0) {
        state.gems+=DAYCARE_RULES.battleRewardGems;journal(state,now,"10 battle victories",DAYCARE_RULES.battleRewardGems);
      }
    }
  } catch(error) {return {status:400,data:{error:error.message}};}
  const guard=crypto.randomUUID(),saveGuard=crypto.randomUUID();
  const statements=[
    db.prepare("UPDATE daycare_states SET state=?,revision=revision+1 WHERE user_id=? AND revision=?").bind(JSON.stringify(state),user.id,row.revision),
    guardStatement(db,guard),
  ];
  if(action==="breed"||action==="hatch") statements.push(db.prepare("INSERT INTO transaction_guards(id,ok) VALUES (?,COALESCE((SELECT revision=? FROM saves WHERE user_id=?),0))").bind(saveGuard,cloud.revision,user.id));
  if(eventId) statements.push(db.prepare("INSERT INTO daycare_battles(user_id,event_id) VALUES (?,?)").bind(user.id,eventId));
  if(grant) {
    const updateGuard=crypto.randomUUID();
    statements.push(...saveBackupStatements(db,user.id),
      db.prepare("INSERT INTO daycare_grants(user_id,egg_id,record) VALUES (?,?,?)").bind(user.id,egg.id,JSON.stringify(grant)),
      db.prepare("UPDATE saves SET payload=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?").bind(payload,now,user.id,cloud.revision),
      guardStatement(db,updateGuard),
      db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(updateGuard));
  }
  statements.push(db.prepare("INSERT INTO daycare_requests(user_id,request_id,kind,receipt) VALUES (?,?,?,?)").bind(user.id,input.requestId,action,JSON.stringify({eggId:egg?.id||null})),
    db.prepare("DELETE FROM transaction_guards WHERE id IN (?,?)").bind(guard,saveGuard));
  try {await db.batch(statements);}
  catch(error) {
    if(/constraint|CHECK|UNIQUE/i.test(error.message)) return {status:409,data:{error:"Another action completed first. Refresh the Daycare; no partial purchase was charged."}};
    throw error;
  }
  const data=await daycareView(db,user,now);
  if(grant) data.cloud=await readCloudSave(db,user.id);
  return {data};
}
