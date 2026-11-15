import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateNativeTeam} from '../src/fan/native-selection.ts';
const records=Array.from({length:7},(_,i)=>({id:`owned-${i}`,data:{species:4,level:5+i,ivs:[i,1,2,3,4,5]},location:'pc',box:0,slot:i}));
test('native Egg Gacha retains machines and pulls while features use normal menu entries',async()=>{
 const gacha=await readFile(new URL('../src/ui/handlers/egg-gacha-ui-handler.ts',import.meta.url),'utf8');
 assert(!gacha.includes('new EggGachaFeatures'));
 assert(gacha.includes('this.setGachaCursor(1)'));
 assert(gacha.includes('void this.pull(pulls)'));
 for(const file of ['../src/phases/title-phase.ts','../src/ui/handlers/menu-ui-handler.ts']){
  const source=await readFile(new URL(file,import.meta.url),'utf8');
  assert(source.includes('handler: () => openDaycare(index)'));
  assert(source.includes('"Gem Rewards"'));
 }
});
test('native selection keeps duplicate species as different owned individuals',()=>{const selected=validateNativeTeam(records,['owned-1','owned-2'],false);assert.equal(selected.length,2);assert.notEqual(selected[0].id,selected[1].id);assert.equal(selected[0].data.species,selected[1].data.species);});
test('one-time starter selection requires exactly one individual',()=>{assert.equal(validateNativeTeam(records,['owned-0'],true).length,1);assert.throws(()=>validateNativeTeam(records,[],true));assert.throws(()=>validateNativeTeam(records,['owned-0','owned-1'],true));});
test('native party limit is six and one ID cannot be selected twice',()=>{assert.equal(validateNativeTeam(records,records.slice(0,6).map(r=>r.id),false).length,6);assert.throws(()=>validateNativeTeam(records,records.map(r=>r.id),false));assert.throws(()=>validateNativeTeam(records,['owned-0','owned-0'],false));});
test('missing records cannot become invented starters',()=>{assert.throws(()=>validateNativeTeam(records,['not-owned'],false));});
test('native selection preserves the actual level and IVs instead of dex-best data',()=>{const before=structuredClone(records);const selected=validateNativeTeam(records,['owned-2'],false);assert.deepEqual(selected[0],records[2]);assert.deepEqual(records,before);});
