import test from "node:test";
import assert from "node:assert/strict";
const storage=new Map();
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
globalThis.window=new EventTarget();
let monotonic=0;
Object.defineProperty(globalThis,"performance",{value:{now:()=>monotonic},configurable:true});
const user={id:"daycare-client-user",username:"ClientTester"};
let serverUser=user,view,failAfterCommit=false,failNetwork=false,receipts,accepted;
function reset() {
  storage.clear();monotonic=0;serverUser=user;receipts=new Set();accepted=0;failAfterCommit=false;failNetwork=false;
  view={user,revision:0,serverNow:1800000000000,state:{gems:30,legendaryNextAt:1800086400000},parents:[],rules:{}};
}
globalThis.fetch=async(path,options)=>{
  if(path.endsWith("/me"))return Response.json({user:serverUser});
  if(options.method==="GET")return Response.json({...view,user:serverUser});
  if(failNetwork)throw new Error("offline");
  const input=JSON.parse(options.body);
  if(!receipts.has(input.requestId)){receipts.add(input.requestId);view.revision++;accepted++;}
  if(failAfterCommit){failAfterCommit=false;throw new Error("response lost");}
  return Response.json(view);
};
const {identify}=await import("../standalone-public/cloud.js");
let serial=0;
async function fresh(){reset();await identify();return import(`../standalone-public/daycare-client.js?test=${serial++}`);}
test("cooldown display follows server time plus monotonic elapsed time, not the computer clock",async()=>{
  const c=await fresh();await c.refreshDaycare();
  monotonic=3723000;
  const original=Date.now;Date.now=()=>999999999999999;
  try{assert.equal(c.daycareServerNow(),1800003723000);assert.equal(c.getDaycareStatus().state.legendaryNextAt-c.daycareServerNow(),82677000);}
  finally{Date.now=original;}
});
test("offline victories remain queued and are retried on reconnect",async()=>{
  const c=await fresh(),key=`fan-daycare-battles:${user.id}`;
  const event={eventId:"run:1",requestId:crypto.randomUUID()};
  localStorage.setItem(key,JSON.stringify([event]));failNetwork=true;
  await assert.rejects(c.flushDaycareBattles(),/offline/);
  assert.equal(JSON.parse(localStorage.getItem(key)).length,1);
  failNetwork=false;await c.flushDaycareBattles();
  assert.equal(accepted,1);assert.deepEqual(JSON.parse(localStorage.getItem(key)),[]);
});
test("a lost success response retries the same receipt without double counting",async()=>{
  const c=await fresh(),key=`fan-daycare-battles:${user.id}`;
  localStorage.setItem(key,JSON.stringify([{eventId:"run:2",requestId:crypto.randomUUID()}]));
  failAfterCommit=true;await assert.rejects(c.flushDaycareBattles(),/response lost/);
  assert.equal(accepted,1);
  await c.flushDaycareBattles();assert.equal(accepted,1);
  assert.deepEqual(JSON.parse(localStorage.getItem(key)),[]);
});
test("an account switch cannot apply another account's Daycare state",async()=>{
  const c=await fresh();await c.refreshDaycare();
  serverUser={id:"different-account",username:"Other"};
  await assert.rejects(c.refreshDaycare(),/Account changed/);
  assert.equal(c.getDaycareStatus().user.id,user.id);
});
