import test from "node:test";
import assert from "node:assert/strict";
const values=new Map(), collection=new Map();
globalThis.localStorage={
  getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),
};
globalThis.window=new EventTarget();
globalThis.indexedDB={open() {
  const request={};
  queueMicrotask(()=>{
    request.result={
      close(){},
      transaction(){
        const tx={objectStore(){return {
          get(key) {const req={};queueMicrotask(()=>{req.result=structuredClone(collection.get(key));tx.oncomplete?.();});return req;},
          put(value,key) {const req={};queueMicrotask(()=>{collection.set(key,structuredClone(value));tx.oncomplete?.();});return req;},
        };}};
        return tx;
      },
    };
    request.onsuccess();
  });
  return request;
}};
const user={id:"account-one",username:"TrainerOne"};
let serverUser=user, remote=null, revision=0, mode=null;
globalThis.fetch=async(path,options)=>{
  const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json"}});
  if(path.endsWith("/me")) return respond({user:serverUser});
  if(options.method==="GET") return respond({user:serverUser,save:remote,revision});
  const input=JSON.parse(options.body);
  if(input.userId!==serverUser?.id) return respond({error:"Account changed"},409);
  if(input.revision!==revision || mode==="conflict") return respond({error:"Cloud changed"},409);
  remote=structuredClone(input.save);revision++;
  return respond({user:serverUser,revision});
};
let serial=0;
async function fresh() {
  values.clear();collection.clear();remote=null;revision=0;serverUser=user;mode=null;
  const client=await import(`../standalone-public/cloud.js?test=${serial++}`);
  await client.identify();
  return client;
}
test("account collections and native save keys do not share guest storage",async()=>{
  const c=await fresh();
  localStorage.setItem("data_Guest","guest-save");
  await c.collectionStorage("save",{...c.emptyCollection(),starterChosen:true});
  assert.equal(c.collectionKey(),"account:account-one");
  assert.equal(c.hasProgress(await c.readSnapshot()),false);
  assert.equal((await c.readSnapshot(null)).local.data,"guest-save");
});
test("legacy unqualified guest saves can be explicitly copied without being deleted",async()=>{
  const c=await fresh();localStorage.setItem("sessionData","legacy-run");
  assert.equal((await c.readSnapshot(null)).local.sessionData,"legacy-run");
  assert.equal((await c.readSnapshot()).local.sessionData,undefined);
  assert.equal(localStorage.getItem("sessionData"),"legacy-run");
});
test("sync uploads account progress, remembers revision and does not repeat unchanged writes",async()=>{
  const c=await fresh();
  localStorage.setItem("data_TrainerOne","system-save");
  await c.syncCloud();
  assert.equal(revision,1);assert.equal(remote.local.data,"system-save");
  await c.syncCloud();assert.equal(revision,1);
  localStorage.setItem("sessionData_TrainerOne","run-save");
  await c.syncCloud();assert.equal(revision,2);assert.equal(remote.local.sessionData,"run-save");
});
test("empty accounts do not create cloud data before choosing to play or import",async()=>{
  const c=await fresh();await c.syncCloud();assert.equal(remote,null);
});
test("a fresh device restores cloud saves without touching the Guest",async()=>{
  const c=await fresh();
  remote={local:{data:"cloud-system",sessionData:"cloud-run"},collection:{...c.emptyCollection(),starterChosen:true}};
  revision=4;localStorage.setItem("data_Guest","leave-alone");
  await c.reconcile();
  assert.equal(localStorage.getItem("data_TrainerOne"),"cloud-system");
  assert.equal(localStorage.getItem("data_Guest"),"leave-alone");
  assert.equal((await c.readSnapshot()).collection.starterChosen,true);
});
test("unchanged local saves refresh from a newer cloud revision",async()=>{
  const c=await fresh();
  localStorage.setItem("data_TrainerOne","old");
  await c.syncCloud();
  remote.local.data="newer-device";revision++;
  await c.reconcile();assert.equal(localStorage.getItem("data_TrainerOne"),"newer-device");
  assert(localStorage.getItem("fan-backup:account-one"));
});
test("new local progress and newer cloud progress produce a conflict rather than overwrite",async()=>{
  const c=await fresh();
  localStorage.setItem("data_TrainerOne","baseline");await c.syncCloud();
  localStorage.setItem("data_TrainerOne","local-new");
  remote.local.data="cloud-new";revision++;
  await assert.rejects(c.reconcile(),/Both this device/);
  assert.equal(localStorage.getItem("data_TrainerOne"),"local-new");assert.equal(remote.local.data,"cloud-new");
});
test("stale uploads and account switches cannot silently overwrite cloud progress",async()=>{
  const c=await fresh();
  localStorage.setItem("data_TrainerOne","baseline");await c.syncCloud();
  localStorage.setItem("data_TrainerOne","unsynced");
  serverUser={id:"account-two",username:"OtherTrainer"};
  await assert.rejects(c.syncCloud(),/Account changed/);
  assert.equal(remote.local.data,"baseline");assert.equal(localStorage.getItem("data_TrainerOne"),"unsynced");
});
