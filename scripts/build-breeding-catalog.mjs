import { writeFile } from "node:fs/promises";
const commit = await (await fetch("https://api.github.com/repos/PokeAPI/pokeapi/commits?path=data/v2/csv/pokemon_species.csv&per_page=1",{headers:{"User-Agent":"pokerogue-fan-build"}})).json();
const sha=commit[0]?.sha;
if (!sha) throw new Error("Could not pin the breeding data source.");
async function csv(name) {
  const response=await fetch(`https://raw.githubusercontent.com/PokeAPI/pokeapi/${sha}/data/v2/csv/${name}.csv`);
  if (!response.ok) throw new Error(`Missing ${name}`);
  const [head,...lines]=(await response.text()).trim().split(/\r?\n/);
  const keys=head.split(",");
  return lines.map(line=>Object.fromEntries(line.split(",").map((v,i)=>[keys[i],v])));
}
const [species,groups]=await Promise.all([csv("pokemon_species"),csv("pokemon_egg_groups")]);
const byId=new Map(species.map(s=>[Number(s.id),s]));
const catalog={};
for(const s of species) {
  const id=Number(s.id);if(id>1025)continue;
  let root=s;
  while(root.evolves_from_species_id) root=byId.get(Number(root.evolves_from_species_id));
  catalog[id]={id,name:s.identifier.split("-").map(w=>w[0].toUpperCase()+w.slice(1)).join(" "),
    root:Number(root.id),groups:groups.filter(g=>Number(g.species_id)===id).map(g=>Number(g.egg_group_id)),
    genderRate:Number(s.gender_rate),legendary:s.is_legendary==="1"||s.is_mythical==="1"};
}
await writeFile("server/species-breeding.json",JSON.stringify(catalog));
await writeFile("server/BREEDING_DATA_SOURCE.md",`# Breeding metadata\n\nNational species 1–1025, egg groups, evolution roots, genders, and legendary/mythical flags derived from [PokeAPI](https://github.com/PokeAPI/pokeapi/tree/${sha}/data/v2/csv) (BSD-3-Clause project). Pinned source commit: \`${sha}\`.\n\nThe generated catalog is checked in; ordinary builds do not download data. Regional/custom species outside the catalog are explicitly unavailable in this first breeding release. No game art is downloaded by this script.\n`);
console.log(`Generated breeding metadata for ${Object.keys(catalog).length} species.`);
