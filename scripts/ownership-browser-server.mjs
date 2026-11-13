// Isolated real-browser IndexedDB test harness. Never touches the game's DB.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const name='pokerogue-ownership-test-'+crypto.randomUUID();
const source=stripTypeScriptTypes(await readFile('src/fan/ownership-store.ts','utf8')).replace('"pokerogue-fan-ownership"',JSON.stringify(name));
createServer((req,res)=>{
 if(req.url==='/ownership-store.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(source);return;}
 res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Isolated PokéRogue ownership tests</title><h1>Real IndexedDB ownership tests</h1><p>Temporary, isolated test database. No game saves are modified.</p>');
}).listen(8892,'127.0.0.1',()=>console.log('Ownership test harness: http://127.0.0.1:8892'));
