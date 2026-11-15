import {api,identify,readSnapshot,writeSnapshot,uploadSnapshot,hasProgress} from "./cloud.js";
const $ = id => document.getElementById(id);
let user, signup = false, busy = false;
function status(message,error=false) { $("status").textContent=message; $("status").classList.toggle("error",error); }
async function action(fn) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button").forEach(b=>b.disabled=true);
  try { await fn(); } catch(error) { status(error.message,true); }
  finally { busy=false; document.querySelectorAll("button").forEach(b=>b.disabled=false); }
}
async function withSaveLock(fn) {
  if (!navigator.locks) throw new Error("Use an up-to-date browser with Web Locks to manage cloud saves safely.");
  return navigator.locks.request(`fan-playing:${user.id}`,{ifAvailable:true},lock=>{
    if (!lock) throw new Error("Close the other game tab before managing saves.");
    return fn();
  });
}
async function refresh() {
  user = await identify();
  $("signed-in").hidden = !user;
  $("signed-out").hidden = !!user;
  if (!user) { status("Log in to sync your collection across devices."); return; }
  $("trainer-name").textContent=`Welcome, ${user.username}`;
  const cloud = await api("save");
  $("save-info").textContent=cloud.save
    ? `${cloud.save.collection.records.length} owned Pokémon · Last cloud save: ${new Date(cloud.updatedAt).toLocaleString()}`
    : "No cloud save yet. Start a new adventure or import your guest progress.";
  $("use-cloud").hidden = !cloud.save;
  $("import-guest").hidden = hasProgress(await readSnapshot()) || !!cloud.save;
  status(new URLSearchParams(location.search).has("notice")
    ? "Cloud sync needs attention. Close other game tabs, then choose which save to keep below."
    : "Your account is ready. Save changes are protected against accidental overwrites.");
}
$("switch-mode").onclick=()=>{
  signup=!signup;
  $("signup-extra").hidden=!signup;
  $("confirm-password").required=signup;
  $("password").autocomplete=signup?"new-password":"current-password";
  $("submit-auth").textContent=signup?"Create account":"Log in";
  $("switch-mode").textContent=signup?"Already registered? Log in":"New here? Create an account";
  $("account-title").textContent=signup?"Create trainer account":"Trainer account";
};
$("show-password").onchange=()=>{ $("password").type=$("show-password").checked?"text":"password"; };
$("auth-form").onsubmit=event=>{
  event.preventDefault();
  void action(async()=>{
    const password=$("password").value;
    if(signup && password!==$("confirm-password").value) throw new Error("The passwords do not match.");
    await api(signup?"register":"login","POST",{username:$("username").value,password});
    $("password").value=""; $("confirm-password").value="";
    await refresh();
  });
};
$("logout").onclick=()=>action(async()=>{
  await withSaveLock(async()=>{await api("logout","POST",{});});
  await refresh();
});
$("save-now").onclick=()=>action(()=>withSaveLock(async()=>{
  const local=await readSnapshot(), cloud=await api("save");
  if (cloud.user.id!==user.id) throw new Error("Account changed. Reload this page.");
  if (!hasProgress(local)) throw new Error("No progress on this device to upload. Restore your cloud save or start playing first.");
  if (!confirm("Upload this device's progress? This replaces the current cloud save. Close all game tabs on your other devices first.")) return;
  if (cloud.save) localStorage.setItem(`fan-cloud-backup:${user.id}`,JSON.stringify(cloud.save));
  await uploadSnapshot(local,cloud.revision); await refresh(); status("Cloud save updated.");
}));
$("use-cloud").onclick=()=>action(()=>withSaveLock(async()=>{
  const cloud=await api("save");
  if (cloud.user.id!==user.id) throw new Error("Account changed. Reload this page.");
  if (!cloud.save) throw new Error("No cloud save is available.");
  if (!confirm("Replace this account's progress on this device with the cloud save? A local backup will be retained. Guest saves are not changed.")) return;
  await writeSnapshot(cloud.save,cloud.revision); await refresh(); status("Cloud save restored. You can play now.");
}));
$("import-guest").onclick=()=>action(()=>withSaveLock(async()=>{
  const guest=await readSnapshot(null), local=await readSnapshot(), cloud=await api("save");
  if (cloud.user.id!==user.id) throw new Error("Account changed. Reload this page.");
  if (hasProgress(local)||cloud.save) throw new Error("Guest import is only allowed into an empty account to avoid losing Pokémon.");
  if (!hasProgress(guest)) throw new Error("No guest progress was found in this browser.");
  if (!confirm(`Copy your guest progress (${guest.collection.records.length} Pokémon) into this account? Your original guest saves will remain unchanged.`)) return;
  const result=await uploadSnapshot(guest,0);
  await writeSnapshot(guest,result.revision); await refresh(); status("Guest progress copied safely into your account.");
}));
$("export").onclick=()=>action(async()=>{
  const data=JSON.stringify(await readSnapshot());
  const url=URL.createObjectURL(new Blob([data],{type:"application/json"}));
  const link=document.createElement("a");link.href=url;link.download=`pokerogue-${user.username}-backup.json`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
});
$("server-backup").onclick=()=>action(async()=>{
  const {backups}=await api("save/backups");
  if(!backups.length)throw new Error("No earlier cloud save yet. The latest three previous revisions are kept automatically as you play.");
  const {save}=await api(`save/backups/${backups[0].revision}`);
  const url=URL.createObjectURL(new Blob([JSON.stringify(save)],{type:"application/json"}));
  const link=document.createElement("a");link.href=url;link.download=`pokerogue-${user.username}-previous-cloud.json`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  status("Previous cloud backup downloaded. Gems and Daycare cooldowns are stored separately and do not roll back.");
});
void action(refresh);
