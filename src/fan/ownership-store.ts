/** Permanent individual ownership, independent of PokéRogue's starter-unlock dex. */
export interface PokemonSnapshot {
  id: number;
  species: number;
  level: number;
  nickname: string;
  shiny: boolean;
  ivs: number[];
  stats: number[];
  hp: number;
  nature: number;
  abilityIndex: number;
  formIndex: number;
  player: boolean;
  [key: string]: unknown;
}
export interface OwnedRecord {
  id: string;
  data: PokemonSnapshot;
  originalTrainer: string;
  capturedAt: string;
  family: number;
  location: "party" | "pc" | "home";
  box: number;
  slot: number;
  favorite: boolean;
  locked: boolean;
}
export interface CollectionSave {
  schema: 1;
  starterChosen: boolean;
  revision: number;
  records: OwnedRecord[];
  candy: Record<string, number>;
  stardust: number;
  boxes: { id: number; name: string; background: string }[];
  transfers: { id: string; pokemonId: string; from: string; to: string; date: string }[];
}
export const newCollection = (): CollectionSave => ({
  schema: 1, starterChosen: false, revision: 0, records: [], candy: {}, stardust: 0,
  boxes: Array.from({ length: 8 }, (_,id) => ({ id, name: `Box ${id + 1}`, background: "forest" })),
  transfers: [],
});
export function firstFree(save: CollectionSave, location: OwnedRecord["location"]): { box: number; slot: number } {
  for (let n = 0; n < (location === "party" ? 6 : save.boxes.length * 30); n++) {
    const box = location === "party" ? 0 : Math.floor(n / 30), slot = location === "party" ? n : n % 30;
    if (!save.records.some(r => r.location === location && r.box === box && r.slot === slot)) return { box, slot };
  }
  // Captures must never be discarded because a box is full. Add a box atomically.
  if (location !== "party") {
    const box = save.boxes.length;
    save.boxes.push({ id: box, name: `Box ${box + 1}`, background: "forest" });
    return { box, slot: 0 };
  }
  throw new Error("The party already has six Pokémon.");
}
export function validateCollection(save: CollectionSave): void {
  const ids = new Set<string>(), slots = new Set<string>();
  for (const record of save.records) {
    if (ids.has(record.id)) throw new Error("Duplicate individual Pokémon ID.");
    ids.add(record.id);
    const slot = `${record.location}:${record.box}:${record.slot}`;
    if (slots.has(slot)) throw new Error("Duplicate storage slot.");
    slots.add(slot);
    if (record.slot < 0 || record.slot >= (record.location === "party" ? 6 : 30) || !Number.isInteger(record.slot)) throw new Error("Invalid storage slot.");
    if (!save.boxes.some(b => b.id === record.box) || record.location === "party" && record.box !== 0) throw new Error("Invalid storage box.");
  }
  if (!Number.isSafeInteger(save.stardust) || save.stardust < 0 || Object.values(save.candy).some(v => !Number.isSafeInteger(v) || v < 0)) throw new Error("Invalid currency balance.");
}
export function moveRecord(save: CollectionSave, id: string, location: OwnedRecord["location"], box: number, slot: number): void {
  const record = save.records.find(r => r.id === id);
  if (!record) throw new Error("Companion not found.");
  if (!["party", "pc", "home"].includes(location)) throw new Error("Invalid destination.");
  const destination = save.records.find(r => r.id !== id && r.location === location && r.box === box && r.slot === slot);
  const previous = { location: record.location, box: record.box, slot: record.slot };
  if (destination) Object.assign(destination, previous);
  Object.assign(record, { location, box, slot });
  save.transfers.push({ id: crypto.randomUUID(), pokemonId: id, from: `${previous.location}:${previous.box}:${previous.slot}`, to: `${location}:${box}:${slot}`, date: new Date().toISOString() });
  validateCollection(save);
}
let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("pokerogue-fan-ownership", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("collection");
    req.onerror = () => { database = undefined; reject(req.error); };
    req.onsuccess = () => resolve(req.result);
    req.onblocked = () => reject(new Error("Close another game tab to initialize collection storage."));
  });
}
/** IndexedDB serializes read/write transactions, including actions from other tabs. */
export async function collectionTransaction(change?: (save: CollectionSave) => void): Promise<CollectionSave> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("collection", change ? "readwrite" : "readonly");
    const store = tx.objectStore("collection");
    let result: CollectionSave, failure: unknown;
    const read = store.get("save");
    read.onsuccess = () => {
      try {
        result = read.result ?? newCollection();
        if (change) { change(result); validateCollection(result); result.revision++; store.put(result, "save"); }
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { if (change) window.dispatchEvent(new CustomEvent("fan-collection-updated")); resolve(result); };
    tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error("Your collection could not be saved."));
  });
}
