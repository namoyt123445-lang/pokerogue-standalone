// Shared by the native game and /account.html. No passwords or session tokens
// are kept in browser storage; the server uses a Secure, HttpOnly cookie.
let activeUser = null;
let blocked = false;
let timer;
const nativeKeys = ["data","sessionData","sessionData1","sessionData2","sessionData3","sessionData4","runHistoryData"];
export const emptyCollection = () => ({
  schema:1,starterChosen:false,revision:0,records:[],candy:{},stardust:0,
  boxes:Array.from({length:8},(_,id)=>({id,name:`Box ${id+1}`,background:"forest"})),transfers:[],
});
export const getAccountUser = () => activeUser;
export const collectionKey = () => activeUser ? `account:${activeUser.id}` : "save";
export async function api(path, method = "GET", data) {
  const response = await fetch(`/api/fan/${path}`, {
    method, credentials:"same-origin", cache:"no-store",
    headers:data === undefined ? {} : {"Content-Type":"application/json"},
    body:data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "Account request failed.");
    error.status = response.status;
    throw error;
  }
  return result;
}
export async function identify() {
  activeUser = (await api("me")).user;
  return activeUser;
}
export async function collectionStorage(key, value) {
  const db = await new Promise((resolve,reject)=>{
    const req = indexedDB.open("pokerogue-fan-ownership",1);
    req.onupgradeneeded = () => req.result.createObjectStore("collection");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Close other game tabs to open collection storage."));
  });
  try {
    return await new Promise((resolve,reject)=>{
      const tx = db.transaction("collection",value === undefined ? "readonly" : "readwrite");
      const store = tx.objectStore("collection");
      const req = value === undefined ? store.get(key) : store.put(value,key);
      tx.oncomplete = () => resolve(value === undefined ? req.result ?? emptyCollection() : value);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function readSnapshot(user = activeUser) {
  const suffix = user?.username || "Guest";
  const local = {};
  for (const key of nativeKeys) {
    const value = localStorage.getItem(`${key}_${suffix}`) ?? (!user ? localStorage.getItem(key) : null);
    if (value !== null) local[key] = value;
  }
  return {local,collection:await collectionStorage(user ? `account:${user.id}` : "save")};
}
export function hasProgress(save) {
  return Object.keys(save.local).length > 0 || save.collection.starterChosen || save.collection.records.length > 0;
}
async function signature(save) {
  // Stable key order for native save fields, independent of transport JSON order.
  const local = {};
  for (const key of nativeKeys) if (save.local[key] !== undefined) local[key] = save.local[key];
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify({local,collection:save.collection})));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
const metaKey = () => `fan-cloud:${activeUser.id}`;
const meta = () => JSON.parse(localStorage.getItem(metaKey()) || '{"revision":0,"signature":null}');
async function remember(save, revision) {
  localStorage.setItem(metaKey(),JSON.stringify({revision,signature:await signature(save)}));
}
export async function writeSnapshot(save, revision) {
  if (!activeUser) throw new Error("Log in before restoring a cloud save.");
  // Backups are account-scoped and never replace the Guest data.
  const old = await readSnapshot();
  if (hasProgress(old)) localStorage.setItem(`fan-backup:${activeUser.id}`,JSON.stringify(old));
  await collectionStorage(collectionKey(),save.collection);
  for (const key of nativeKeys) {
    if (save.local[key] === undefined) localStorage.removeItem(`${key}_${activeUser.username}`);
    else localStorage.setItem(`${key}_${activeUser.username}`,save.local[key]);
  }
  await remember(save,revision);
}
export async function uploadSnapshot(save, revision) {
  const previousIds=new Set(save.collection.records.map(r=>r.id));
  const result = await api("save","PUT",{userId:activeUser.id,revision,save});
  if (result.user.id !== activeUser.id) throw new Error("Account changed. Reload the page.");
  if(result.collection) {
    const missing=result.collection.records.filter(r=>!previousIds.has(r.id));
    if(missing.length) await mergeOwnedGrants(missing);
    save.collection=result.collection;
  }
  await remember(save,result.revision);
  return result;
}
async function mergeOwnedGrants(records) {
  const db=await new Promise((resolve,reject)=>{
    const req=indexedDB.open("pokerogue-fan-ownership",1);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  try {
    await new Promise((resolve,reject)=>{
      const tx=db.transaction("collection","readwrite"),store=tx.objectStore("collection"),req=store.get(collectionKey());
      req.onsuccess=()=>{
        const c=req.result||emptyCollection();
        for(const record of records) {
          if(c.records.some(r=>r.id===record.id)) continue;
          let n=0;while(c.records.some(r=>r.location==="pc"&&r.box===Math.floor(n/30)&&r.slot===n%30)) n++;
          const box=Math.floor(n/30);
          if(!c.boxes.some(b=>b.id===box))c.boxes.push({id:box,name:`Box ${box+1}`,background:"forest"});
          c.records.push({...record,location:"pc",box,slot:n%30});c.revision++;
        }
        store.put(c,collectionKey());
      };
      tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);
    });
  } finally {db.close();}
}
export async function reconcile() {
  if (!activeUser) return;
  const cloud = await api("save");
  if (cloud.user.id !== activeUser.id) throw new Error("Account changed. Reload the page.");
  const local = await readSnapshot(), saved = meta();
  if (!cloud.save) return;
  const localSignature = await signature(local);
  if (localSignature === await signature(cloud.save)) { await remember(local,cloud.revision); return; }
  if (cloud.revision === saved.revision) return; // This device has newer unsynced progress.
  if (!hasProgress(local) || localSignature === saved.signature) {
    await writeSnapshot(cloud.save,cloud.revision);
    return;
  }
  throw new Error("Both this device and the cloud have changed. Choose which save to keep on the Account page.");
}
export async function syncCloud() {
  if (!activeUser || blocked) return;
  const run = async () => {
    const save = await readSnapshot(), saved = meta();
    if (!hasProgress(save) && saved.revision === 0) return;
    if (await signature(save) === saved.signature) return;
    try {
      await uploadSnapshot(save,saved.revision);
      window.dispatchEvent(new CustomEvent("fan-cloud-status",{detail:"saved"}));
    } catch (error) {
      if ([401,409].includes(error.status)) blocked = true;
      window.dispatchEvent(new CustomEvent("fan-cloud-status",{detail:error.message}));
      throw error;
    }
  };
  if (navigator.locks) return navigator.locks.request(`fan-cloud:${activeUser.id}`,run);
  return run();
}
export function scheduleCloudSave() {
  if (!activeUser || blocked) return;
  clearTimeout(timer);
  timer = setTimeout(()=>syncCloud().catch(console.error),1500);
}
export async function bootstrapAccounts() {
  await identify();
  if (activeUser && navigator.locks) {
    const acquired = await new Promise(resolve => {
      navigator.locks.request(`fan-playing:${activeUser.id}`,{ifAvailable:true},lock => {
        resolve(!!lock);
        if (lock) return new Promise(()=>{}); // Released automatically on navigation/close.
      });
    });
    if (!acquired) throw new Error("This account is already playing in another tab. Close that tab first.");
  }
  await reconcile();
  if (!activeUser) return;
  window.addEventListener("fan-collection-updated",scheduleCloudSave);
  window.addEventListener("fan-native-save",scheduleCloudSave);
  // Also catches native slot deletion, imports and less common save paths.
  setInterval(()=>syncCloud().catch(console.error),30000);
  scheduleCloudSave();
}
