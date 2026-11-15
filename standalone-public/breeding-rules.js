export const DAYCARE_RULES = Object.freeze({
  welcomeGems:30,dailyGems:10,dailyTaskBattles:20,dailyTaskGems:10,
  battleRewardEvery:10,battleRewardGems:2,rewardedBattlesPerDay:200,
  normalCost:5,legendaryCost:25,normalHatchBattles:10,legendaryHatchBattles:40,
  cooldownMs:86400000,slotPrices:[25,50,75,100,125],maxSlots:6,
});
export function planBreeding(a,b,catalog) {
  if(!a||!b) throw new Error("Choose two owned Pokémon.");
  if(a.id===b.id) throw new Error("Choose two different individuals.");
  const x=catalog[a.data.species],y=catalog[b.data.species];
  if(!x||!y) throw new Error("Regional/custom species are not supported by this first breeding release.");
  if(a.data.fusionSpecies||b.data.fusionSpecies) throw new Error("Fused Pokémon cannot breed.");
  const dittoA=x.id===132,dittoB=y.id===132;
  if(dittoA&&dittoB) throw new Error("Two Ditto cannot produce an egg.");
  const legendary=x.legendary||y.legendary;
  if(legendary && !(dittoA!==dittoB)) throw new Error("A legendary or mythical Pokémon needs Ditto.");
  let mother;
  if(dittoA||dittoB) mother=dittoA?y:x;
  else {
    if(x.groups.includes(15)||y.groups.includes(15)) throw new Error("These Pokémon cannot breed yet (Undiscovered egg group).");
    if(a.data.gender<0||b.data.gender<0||a.data.gender===b.data.gender) throw new Error("Choose a female and male, or use Ditto.");
    if(!x.groups.some(group=>y.groups.includes(group))) throw new Error("These parents do not share an egg group.");
    mother=a.data.gender===1?x:y;
  }
  if(!legendary && mother.groups.includes(15)) throw new Error("This Pokémon cannot breed yet (Undiscovered egg group).");
  const species=legendary?mother.id:mother.root;
  const offspring=catalog[species];
  if(!offspring) throw new Error("This offspring is not available.");
  return {species,name:offspring.name,legendary,cost:legendary?DAYCARE_RULES.legendaryCost:DAYCARE_RULES.normalCost,
    battles:legendary?DAYCARE_RULES.legendaryHatchBattles:DAYCARE_RULES.normalHatchBattles};
}
export function formatDaycareTime(ms) {
  const seconds=Math.max(0,Math.ceil(ms/1000));
  return `${String(Math.floor(seconds/3600)).padStart(2,"0")}h ${String(Math.floor(seconds/60)%60).padStart(2,"0")}m ${String(seconds%60).padStart(2,"0")}s`;
}
