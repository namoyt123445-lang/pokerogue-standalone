import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { handleAccounts } from "../server/accounts.mjs";

// Loopback-only test environment. No Cloudflare credentials, D1 or live API calls.
const root=resolve("dist"), data=resolve(".local-test");
await mkdir(data,{recursive:true});
const sql=new DatabaseSync(resolve(data,"accounts.sqlite"));
sql.exec("PRAGMA foreign_keys=ON");
sql.exec(await readFile("server/schema.sql","utf8"));
const db={
  prepare(query) {
    const statement=sql.prepare(query);let values=[];
    return {
      bind(...args){values=args;return this;},
      async first(){return statement.get(...values)??null;},
      async all(){return {results:statement.all(...values)};},
      async run(){const result=statement.run(...values);return {meta:{changes:Number(result.changes)}};},
      execute(){const result=statement.run(...values);return {meta:{changes:Number(result.changes)}};},
    };
  },
  async batch(statements){
    // No await between BEGIN/COMMIT: another request cannot interleave here.
    sql.exec("BEGIN");
    try{const results=statements.map(statement=>statement.execute());sql.exec("COMMIT");return results;}
    catch(error){sql.exec("ROLLBACK");throw error;}
  },
};
const packs=new Map();
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".json":"application/json",
  ".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml",".ogg":"audio/ogg",
  ".mp3":"audio/mpeg",".wav":"audio/wav",".ttf":"font/ttf",".woff2":"font/woff2",".webmanifest":"application/manifest+json"};
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||"/","http://127.0.0.1:8000");
    if(url.pathname.startsWith("/api/fan/")){
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024){res.writeHead(413).end();return;}chunks.push(chunk);}
      const headers=new Headers();
      if(req.headers.cookie)headers.set("Cookie",req.headers.cookie.replaceAll("pokerogue_local_session=","__Host-pokerogue_session="));
      if(req.headers["content-type"])headers.set("Content-Type",req.headers["content-type"]);
      // Preserve origin checks; only this local site's origin is accepted.
      if(req.headers.origin){
        if(!["http://127.0.0.1:8000","http://localhost:8000"].includes(req.headers.origin)){res.writeHead(403).end();return;}
        headers.set("Origin","https://local-test.invalid");
      }
      const request=new Request(`https://local-test.invalid${url.pathname}${url.search}`,{
        method:req.method,headers,body:["GET","HEAD"].includes(req.method)?undefined:Buffer.concat(chunks),
      });
      const result=await handleAccounts(request,{ACCOUNTS:db});
      res.statusCode=result.status;
      result.headers.forEach((value,key)=>{
        if(key==="set-cookie")value=value.replaceAll("__Host-pokerogue_session=","pokerogue_local_session=").replace(/;\s*Secure/gi,"");
        res.setHeader(key,value);
      });
      res.end(Buffer.from(await result.arrayBuffer()));return;
    }
    if(url.pathname==="/service-worker.js"){
      res.setHeader("Content-Type","text/javascript");
      res.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',()=>self.registration.unregister());");return;
    }
    let pathname=decodeURIComponent(url.pathname);
    if(pathname==="/")pathname="/index.html";
    const target=resolve(root,`.${pathname}`);
    if(!target.startsWith(root+sep)){res.writeHead(403).end();return;}
    let bytes;
    try{bytes=await readFile(target);}
    catch{
      if(!pathname.endsWith(".json")){res.writeHead(404).end("Not found");return;}
      let hash=0;for(const char of pathname)hash=(hash*31+char.charCodeAt(0))>>>0;
      const id=hash%128;
      if(!packs.has(id))packs.set(id,JSON.parse(await readFile(resolve(root,`json-packs/${id}.json`),"utf8")));
      const entry=packs.get(id)[pathname];
      if(entry===undefined){res.writeHead(404).end("Not found");return;}
      bytes=Buffer.from(entry);
    }
    res.setHeader("Content-Type",mime[extname(target)]||"application/octet-stream");
    res.setHeader("Cache-Control","no-store");
    res.setHeader("X-Content-Type-Options","nosniff");
    res.end(req.method==="HEAD"?undefined:bytes);
  }catch(error){console.error(error);res.writeHead(500).end("Local test error");}
}).listen(8000,"127.0.0.1",()=>console.log("Normal 2D local test: http://127.0.0.1:8000 — isolated local accounts; no live-site connection."));
