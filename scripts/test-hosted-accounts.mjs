// Run against a deployed preview, never against a localhost server.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
const origin = new URL(process.argv[2]).origin;
if (!origin.endsWith(".pokerogue-standalone.pages.dev")) throw new Error("Use this project's preview hostname.");
const created = [];
async function request(path, method="GET", data, cookie, extra={}) {
  const response=await fetch(`${origin}/api/fan/${path}`,{
    method,headers:{Origin:origin,"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{}),...extra},
    body:data===undefined?undefined:JSON.stringify(data),
  });
  return {status:response.status,data:await response.json(),cookie:response.headers.get("set-cookie")?.split(";")[0]};
}
const accounts=Array.from({length:2},()=>({username:`qa_api_${randomBytes(5).toString("hex")}`,password:randomBytes(24).toString("hex")}));
try {
  assert.equal((await request("save")).status,401);
  for (const credentials of accounts) {
    const registered=await request("register","POST",credentials);
    assert.equal(registered.status,200,JSON.stringify(registered.data));
    credentials.cookie=registered.cookie;credentials.userId=registered.data.user.id;
    created.push({id:credentials.userId,username:credentials.username});
    assert.equal((await request("me","GET",undefined,credentials.cookie)).data.user.id,credentials.userId);
  }
  const [a,b]=accounts;
  assert.equal((await request("login","POST",{username:a.username,password:"wrong-password-1234"})).status,401);
  const login=await request("login","POST",{username:a.username.toUpperCase(),password:a.password});
  assert.equal(login.status,200);await request("logout","POST",{},login.cookie);
  const save={local:{},collection:{schema:1,records:[],starterChosen:false,candy:{},stardust:0,revision:0,boxes:[],transfers:[]}};
  const payload={userId:a.userId,revision:0,save};
  assert.equal((await request("save","PUT",payload,a.cookie)).data.revision,1);
  assert.deepEqual((await request("save","GET",undefined,a.cookie)).data.save,save);
  assert.equal((await request("save","GET",undefined,b.cookie)).data.save,null);
  assert.equal((await request("save","PUT",payload,a.cookie)).status,409);
  assert.equal((await request("save","PUT",{...payload,revision:1},b.cookie)).status,409);
  assert.equal((await request("save","PUT",{...payload,revision:1},a.cookie,{Origin:"https://evil.test"})).status,403);
  save.local.data="compressible-system-save-".repeat(12000);
  assert.equal((await request("save","PUT",{...payload,revision:1},a.cookie)).data.revision,2);
  assert.deepEqual((await request("save","GET",undefined,a.cookie)).data.save,save);
  for(const credentials of accounts) {
    assert.equal((await request("logout","POST",{},credentials.cookie)).status,200);
    assert.equal((await request("save","GET",undefined,credentials.cookie)).status,401);
  }
  console.log("Hosted account checks passed: signup, login, secure sessions, isolation, cloud round-trip/compression, conflict/CSRF protection, logout.");
} finally {
  console.log("QA-only accounts to remove:",JSON.stringify(created));
}
