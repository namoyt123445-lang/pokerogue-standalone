import {api,getAccountUser} from "./cloud.js";
let latest=null,clockAt=0,serverAt=0,started=false,running=false;
export const getDaycareStatus=()=>latest;
export const daycareServerNow=()=>serverAt+(performance.now()-clockAt);
export function acceptDaycareStatus(data) {
  const user=getAccountUser();
  if(!user||data.user?.id!==user.id) throw new Error("Account changed. Reload the page.");
  if(!latest||data.revision>=latest.revision) {
    latest=data;serverAt=data.serverNow;clockAt=performance.now();
    window.dispatchEvent(new CustomEvent("fan-daycare-status"));
  }
  return data;
}
export async function refreshDaycare() {return acceptDaycareStatus(await api("daycare"));}
export async function daycareAction(kind,details={},requestId=crypto.randomUUID()) {
  const user=getAccountUser();
  if(!user) throw new Error("Log in to use Gems and the Daycare.");
  if(!latest)await refreshDaycare();
  return acceptDaycareStatus(await api(`daycare/${kind}`,"POST",{...details,userId:user.id,revision:latest.revision,requestId}));
}
const queueKey=()=>`fan-daycare-battles:${getAccountUser().id}`;
export async function flushDaycareBattles() {
  if(!getAccountUser()||running)return;
  running=true;
  const run=async()=>{
    // Process a bounded batch, retaining all remaining wins for the next pass.
    for(let i=0;i<20;i++) {
      const pending=JSON.parse(localStorage.getItem(queueKey())||"[]");
      if(!pending.length)return;
      const event=pending[0];
      try {
        await refreshDaycare();
        await daycareAction("battle",{eventId:event.eventId},event.requestId);
      } catch(error) {
        if(error.status===409) {
          await refreshDaycare();
          await daycareAction("battle",{eventId:event.eventId},event.requestId);
        } else throw error;
      }
      const current=JSON.parse(localStorage.getItem(queueKey())||"[]");
      localStorage.setItem(queueKey(),JSON.stringify(current.filter(e=>e.requestId!==event.requestId)));
    }
  };
  try {
    if(navigator.locks)await navigator.locks.request(`fan-daycare-sync:${getAccountUser().id}`,run);
    else await run();
  } finally {running=false;}
}
export function queueDaycareBattle(eventId) {
  if(!getAccountUser())return;
  try {
    const pending=JSON.parse(localStorage.getItem(queueKey())||"[]");
    if(!pending.some(e=>e.eventId===eventId)) {
      pending.push({eventId,requestId:crypto.randomUUID()});
      localStorage.setItem(queueKey(),JSON.stringify(pending));
    }
    void flushDaycareBattles().catch(error=>console.warn("Daycare battle progress retained for retry",error.message));
  } catch(error) {
    // A storage/network problem must never break the native battle phase.
    console.warn("Daycare victory could not be queued",error.message);
  }
}
export function startDaycareSync() {
  if(started||!getAccountUser())return;started=true;
  void refreshDaycare().then(flushDaycareBattles).catch(console.warn);
  setInterval(()=>{void refreshDaycare().then(flushDaycareBattles).catch(console.warn);},60000);
}
