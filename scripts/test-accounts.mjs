import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { handleAccounts, passwordHash, validSnapshot } from "../server/accounts.mjs";
const sql = new DatabaseSync(":memory:");
sql.exec(await readFile(new URL("../server/schema.sql",import.meta.url),"utf8"));
const db = {prepare(query) {
  let values = [];
  const stmt = sql.prepare(query);
  return {
    bind(...args) {values=args;return this;},
    async first() {return stmt.get(...values) ?? null;},
    async run() {const result=stmt.run(...values);return {meta:{changes:Number(result.changes)}};},
  };
}};
const env={ACCOUNTS:db};
const origin="https://accounts.test";
async function call(path,method="GET",data,cookie,headers={}) {
  const response = await handleAccounts(new Request(`${origin}/api/fan/${path}`,{
    method,headers:{Origin:origin,"Content-Type":"application/json","CF-Connecting-IP":"192.0.2.1",...(cookie?{Cookie:cookie}:{}),...headers},
    body:data === undefined?undefined:JSON.stringify(data),
  }),env);
  return {status:response.status,data:await response.json(),cookie:response.headers.get("Set-Cookie")?.split(";")[0],headers:response.headers};
}
const credentials={username:"Trainer_One",password:"test-only-password-2934"};
let first, second;
const save={local:{data:"native-system-save",sessionData:"native-run-save"},collection:{schema:1,records:[],starterChosen:false,candy:{},stardust:0,revision:0,boxes:[],transfers:[]}};
test("password hashes use salt and never contain the original password",async()=>{
  const a=await passwordHash(credentials.password,"00000000000000000000000000000000");
  const b=await passwordHash(credentials.password,"11111111111111111111111111111111");
  assert.equal(a.length,64);assert.notEqual(a,b);assert(!a.includes(credentials.password));
});
test("anonymous session and protected saves",async()=>{
  assert.equal((await call("me")).data.user,null);
  assert.equal((await call("save")).status,401);
});
test("registration stores only salted hashes and uses a protected cookie",async()=>{
  first=await call("register","POST",credentials);
  assert.equal(first.status,200);assert.equal(first.data.user.username,credentials.username);
  const cookie=first.headers.get("Set-Cookie");
  assert(cookie.includes("HttpOnly"));assert(cookie.includes("Secure"));assert(cookie.includes("SameSite=Strict"));
  assert.equal(first.headers.get("Cache-Control"),"no-store");
  const row=sql.prepare("SELECT * FROM users WHERE id=?").get(first.data.user.id);
  assert.notEqual(row.password_hash,credentials.password);assert.equal(row.salt.length,32);
  assert.equal((await call("me","GET",undefined,first.cookie)).data.user.id,row.id);
});
test("case-insensitive duplicates, reserved guest, weak passwords and SQL injection are rejected",async()=>{
  assert.equal((await call("register","POST",{...credentials,username:"trainer_one"})).status,409);
  assert.equal((await call("register","POST",{...credentials,username:"Guest"})).status,400);
  assert.equal((await call("register","POST",{...credentials,password:"short"})).status,400);
  assert.equal((await call("register","POST",{...credentials,username:"' OR 1=1;--"})).status,400);
});
test("login rejects invalid credentials and accepts normalized usernames",async()=>{
  assert.equal((await call("login","POST",{...credentials,password:"not-the-password"})).status,401);
  const login=await call("login","POST",{...credentials,username:"TRAINER_ONE"});
  assert.equal(login.status,200);assert.notEqual(login.cookie,first.cookie);
});
test("cross-origin state changes are rejected",async()=>{
  assert.equal((await call("logout","POST",{},first.cookie,{Origin:"https://evil.test"})).status,403);
});
test("cloud saves are account-scoped, use revisions and reject stale writes",async()=>{
  const userId=first.data.user.id;
  assert.equal((await call("save","GET",undefined,first.cookie)).data.save,null);
  assert.equal((await call("save","PUT",{userId,revision:0,save},first.cookie)).data.revision,1);
  assert.equal((await call("save","PUT",{userId,revision:0,save},first.cookie)).status,409);
  assert.equal((await call("save","PUT",{userId,revision:1,save},first.cookie)).data.revision,2);
  assert.deepEqual((await call("save","GET",undefined,first.cookie)).data.save,save);
});
test("another account cannot read or overwrite the first account",async()=>{
  second=await call("register","POST",{...credentials,username:"Trainer_Two"});
  assert.equal((await call("save","GET",undefined,second.cookie)).data.save,null);
  assert.equal((await call("save","PUT",{userId:first.data.user.id,revision:2,save},second.cookie)).status,409);
});
test("large saves are compressed and round-trip without changing Pokémon data",async()=>{
  const large=structuredClone(save);large.local.data="native-save-".repeat(30000);
  assert.equal((await call("save","PUT",{userId:first.data.user.id,revision:2,save:large},first.cookie)).data.revision,3);
  assert(sql.prepare("SELECT payload FROM saves WHERE user_id=?").get(first.data.user.id).payload.startsWith("gzip:"));
  assert.deepEqual((await call("save","GET",undefined,first.cookie)).data.save,large);
});
test("invalid save fields and methods are rejected",async()=>{
  assert(!validSnapshot({...save,local:{sessionData5:"bad"}}));
  assert(!validSnapshot({...save,collection:null}));
  assert.equal((await call("save","PUT",{userId:first.data.user.id,revision:2,save:{...save,local:{password:"bad"}}},first.cookie)).status,400);
  assert.equal((await call("save","DELETE",undefined,first.cookie)).status,404);
});
test("expiry and logout invalidate server sessions",async()=>{
  sql.prepare("UPDATE sessions SET expires_at=0 WHERE user_id=?").run(second.data.user.id);
  assert.equal((await call("me","GET",undefined,second.cookie)).data.user,null);
  const logout=await call("logout","POST",{},first.cookie);
  assert.equal(logout.status,200);assert(logout.headers.get("Set-Cookie").includes("Max-Age=0"));
  assert.equal((await call("save","GET",undefined,first.cookie)).status,401);
});
test("authentication rate limiting is enforced",async()=>{
  let result;
  for (let i=0;i<32;i++) result=await call("login","POST",{...credentials,password:"invalid-password"});
  assert.equal(result.status,429);
});
