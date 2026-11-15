import { packSave,unpackSave,preserveDaycareGrants,saveBackupStatements,guardStatement } from "./save-store.mjs";
import { handleDaycare } from "./daycare.mjs";
const COOKIE = "__Host-pokerogue_session";
const MAX_BODY = 8 * 1024 * 1024;
const TTL = 30 * 86400;
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
const unhex = value => Uint8Array.from(value.match(/../g), v => parseInt(v, 16));
const random = size => hex(crypto.getRandomValues(new Uint8Array(size)));
const hash = async value => hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({name:"PBKDF2", hash:"SHA-256", salt:unhex(salt), iterations:100000}, key, 256));
}
function equal(a, b) {
  let result = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return result === 0;
}
function reply(data, status = 200, cookie) {
  const headers = {
    "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff", "Referrer-Policy":"no-referrer",
  };
  if (cookie) headers["Set-Cookie"] = `${COOKIE}=${cookie}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${cookie === "deleted" ? 0 : TTL}`;
  return new Response(JSON.stringify(data), {status, headers});
}
async function body(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("JSON required");
  if (Number(request.headers.get("content-length")) > MAX_BODY) throw new Error("Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("JSON required");
  let size = 0;
  const chunks = [];
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) { await reader.cancel(); throw new Error("Request too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function session(request, db) {
  const token = request.headers.get("cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare("SELECT users.id, users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?")
    .bind(await hash(token), Math.floor(Date.now()/1000)).first();
}
async function limit(request, db, kind, maximum, duration) {
  const now = Math.floor(Date.now()/1000);
  const key = `${kind}:${await hash(request.headers.get("CF-Connecting-IP") || "unknown")}:${Math.floor(now/duration)}`;
  const row = await db.prepare("INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count")
    .bind(key, now+duration).first();
  // Bounded maintenance; expired rows never affect a new window.
  await db.prepare("DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at<? LIMIT 100)").bind(now).run();
  return row.count <= maximum;
}
export function validSnapshot(save) {
  if (!save || typeof save !== "object" || Array.isArray(save)) return false;
  if (!save.local || typeof save.local !== "object" || Array.isArray(save.local)) return false;
  if (Object.keys(save.local).some(key => !/^(data|sessionData[1-4]?|runHistoryData)$/.test(key) || typeof save.local[key] !== "string")) return false;
  const c = save.collection;
  return c && c.schema === 1 && Array.isArray(c.records) && c.records.length <= 10000
    && typeof c.starterChosen === "boolean" && typeof c.candy === "object" && typeof c.stardust === "number"
    && Array.isArray(c.transfers) && Array.isArray(c.boxes) && Number.isInteger(c.revision);
}
export async function handleAccounts(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/fan/")) return null;
  if (!env.ACCOUNTS) return reply({error:"Account storage is not configured."},503);
  const db = env.ACCOUNTS;
  if (request.method !== "GET" && request.headers.get("Origin") !== url.origin) return reply({error:"Invalid request origin."},403);
  try {
    const path = url.pathname.slice("/api/fan/".length);
    if (path === "me" && request.method === "GET") return reply({user:await session(request, db)});
    if (["register","login"].includes(path) && request.method === "POST") {
      if (!await limit(request,db,"auth",30,900)) return reply({error:"Too many attempts. Try again in 15 minutes."},429);
      const input = await body(request);
      const username = typeof input.username === "string" ? input.username.trim() : "";
      const password = input.password;
      if (!/^[A-Za-z0-9_]{3,24}$/.test(username) || typeof password !== "string" || password.length < 12 || password.length > 128)
        return reply({error:"Use a 3–24 character username (letters, numbers, underscore) and a 12–128 character password."},400);
      const usernameKey = username.toLowerCase();
      if (usernameKey === "guest" && path === "register") return reply({error:"Please choose a username other than Guest."},400);
      let user;
      if (path === "register") {
        if (!await limit(request,db,"register",5,3600)) return reply({error:"Too many signups. Try again later."},429);
        const salt = random(16), id = crypto.randomUUID();
        const digest = await passwordHash(password,salt);
        const inserted = await db.prepare("INSERT OR IGNORE INTO users(id,username,username_key,salt,password_hash,created_at) VALUES (?,?,?,?,?,?)")
          .bind(id,username,usernameKey,salt,digest,Math.floor(Date.now()/1000)).run();
        if (!inserted.meta.changes) return reply({error:"That username is unavailable."},409);
        user = {id,username};
      } else {
        const stored = await db.prepare("SELECT * FROM users WHERE username_key=?").bind(usernameKey).first();
        const digest = await passwordHash(password,stored?.salt || "00000000000000000000000000000000");
        if (!stored || !equal(digest,stored.password_hash)) return reply({error:"Incorrect username or password."},401);
        user = {id:stored.id,username:stored.username};
      }
      const token = random(32), now = Math.floor(Date.now()/1000);
      await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)").bind(await hash(token),user.id,now+TTL).run();
      await db.prepare("DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at<? LIMIT 100)").bind(now).run();
      return reply({user},200,token);
    }
    if (path === "logout" && request.method === "POST") {
      const token = request.headers.get("cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
      if (token) await db.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await hash(token)).run();
      return reply({ok:true},200,"deleted");
    }
    const user = await session(request,db);
    if (!user) return reply({error:"Please log in again."},401);
    if(path==="daycare"||path.startsWith("daycare/")) {
      if(request.method!=="GET"&&!await limit(request,db,`daycare:${user.id}`,120,60)) return reply({error:"Please wait before trying another Daycare action."},429);
      const result=await handleDaycare(path,request,user,db,request.method==="POST"?await body(request):null);
      return reply(result.data,result.status||200);
    }
    if(path==="save/backups"&&request.method==="GET") {
      const rows=await db.prepare("SELECT revision,updated_at FROM save_backups WHERE user_id=? ORDER BY revision DESC LIMIT 3").bind(user.id).all();
      return reply({backups:rows.results});
    }
    if(/^save\/backups\/\d+$/.test(path)&&request.method==="GET") {
      const row=await db.prepare("SELECT payload FROM save_backups WHERE user_id=? AND revision=?").bind(user.id,Number(path.split("/").pop())).first();
      return row?reply({save:await unpackSave(row.payload)}):reply({error:"Backup not found."},404);
    }
    if (path === "save" && request.method === "GET") {
      const row = await db.prepare("SELECT revision,payload,updated_at FROM saves WHERE user_id=?").bind(user.id).first();
      return reply({user,revision:row?.revision || 0,save:row ? await unpackSave(row.payload) : null,updatedAt:row?.updated_at || null});
    }
    if (path === "save" && request.method === "PUT") {
      if (!await limit(request,db,`save:${user.id}`,120,60)) return reply({error:"Save limit reached. Retry shortly."},429);
      const input = await body(request);
      if (input.userId !== user.id) return reply({error:"Account changed. Reload before saving."},409);
      if (!Number.isInteger(input.revision) || input.revision < 0 || !validSnapshot(input.save)) return reply({error:"Invalid save data."},400);
      await preserveDaycareGrants(db,user.id,input.save);
      const payload = await packSave(input.save), now = Date.now();
      if (encoder.encode(payload).length > 1800000) return reply({error:"Cloud save is too large. Download a device backup; your local progress is still safe."},413);
      const guard=crypto.randomUUID();
      const update=input.revision===0
        ? db.prepare("INSERT OR IGNORE INTO saves(user_id,revision,payload,updated_at) VALUES (?,1,?,?)").bind(user.id,payload,now)
        : db.prepare("UPDATE saves SET revision=revision+1,payload=?,updated_at=? WHERE user_id=? AND revision=?").bind(payload,now,user.id,input.revision);
      try {
        await db.batch([...saveBackupStatements(db,user.id),update,guardStatement(db,guard),db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(guard)]);
      } catch(error) {
        if(/constraint|CHECK/i.test(error.message)) return reply({error:"Cloud save changed on another tab or device. Open Account to resolve it."},409);
        throw error;
      }
      return reply({user,revision:input.revision+1,updatedAt:now,collection:input.save.collection});
    }
    return reply({error:"Not found."},404);
  } catch (error) {
    if (error instanceof SyntaxError || ["JSON required","Request too large"].includes(error.message)) return reply({error:error.message},400);
    console.error("Account request failed", error.message);
    return reply({error:"Account service unavailable. Your local saves have not been erased."},503);
  }
}
