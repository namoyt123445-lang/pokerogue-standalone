export async function packSave(save) {
  const json = JSON.stringify(save);
  if (new TextEncoder().encode(json).length < 128000) return json;
  const compressed = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  let binary = "";
  for (let i=0;i<compressed.length;i+=32768) binary += String.fromCharCode(...compressed.subarray(i,i+32768));
  return `gzip:${btoa(binary)}`;
}
export async function unpackSave(payload) {
  if (!payload.startsWith("gzip:")) return JSON.parse(payload);
  const bytes = Uint8Array.from(atob(payload.slice(5)),c=>c.charCodeAt(0));
  return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
}
export async function readCloudSave(db,userId) {
  const row=await db.prepare("SELECT revision,payload,updated_at FROM saves WHERE user_id=?").bind(userId).first();
  return {revision:row?.revision||0,save:row?await unpackSave(row.payload):null,updatedAt:row?.updated_at||null};
}
export function appendGrant(save,record) {
  if(save.collection.records.some(r=>r.id===record.id)) return;
  const copy=structuredClone(record),c=save.collection;
  let n=0;
  while(c.records.some(r=>r.location==="pc"&&r.box===Math.floor(n/30)&&r.slot===n%30)) n++;
  const box=Math.floor(n/30);
  if(!c.boxes.some(b=>b.id===box)) c.boxes.push({id:box,name:`Box ${box+1}`,background:"forest"});
  Object.assign(copy,{location:"pc",box,slot:n%30});
  c.records.push(copy);
}
export async function preserveDaycareGrants(db,userId,save) {
  const result=await db.prepare("SELECT record FROM daycare_grants WHERE user_id=?").bind(userId).all();
  for(const row of result.results) appendGrant(save,JSON.parse(row.record));
  return save;
}
export function saveBackupStatements(db,userId) {
  return [
    db.prepare("INSERT OR IGNORE INTO save_backups(user_id,revision,payload,updated_at) SELECT user_id,revision,payload,updated_at FROM saves WHERE user_id=?").bind(userId),
    db.prepare("DELETE FROM save_backups WHERE user_id=? AND revision NOT IN (SELECT revision FROM save_backups WHERE user_id=? ORDER BY revision DESC LIMIT 3)").bind(userId,userId),
  ];
}
export function guardStatement(db,id) {
  return db.prepare("INSERT INTO transaction_guards(id,ok) VALUES (?,changes())").bind(id);
}
