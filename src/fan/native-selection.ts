import type { CollectionSave, OwnedRecord } from "./ownership-store";

/** Data supplied to the existing Phaser starter UI; never a second UI layer. */
export interface NativeOwnedSelection {
  records: OwnedRecord[];
  firstStarter: boolean;
  candy: CollectionSave["candy"];
}

export function validateNativeTeam(records: OwnedRecord[], ids: string[], firstStarter: boolean): OwnedRecord[] {
  const limit = firstStarter ? 1 : 6;
  if (!ids.length || ids.length > limit) throw new Error(`Choose ${firstStarter ? "one starter" : "one to six owned Pokémon"}.`);
  if (new Set(ids).size !== ids.length) throw new Error("The same individual cannot occupy two party slots.");
  return ids.map(id => {
    const record = records.find(record => record.id === id);
    if (!record) throw new Error("A selected Pokémon is no longer in your collection.");
    return record;
  });
}
