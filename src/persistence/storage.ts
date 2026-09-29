import type { Profile } from "../engine/model";
export interface PersistenceAdapter {
  load(): Profile | undefined;
  save(profile: Profile): void;
  clear(): void;
}
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export const STORAGE_KEY = "newcards.profile";
export function deserialize(raw: string): Profile {
  const p = JSON.parse(raw);
  if (p.version !== 1)
    throw Error(
      `Unsupported save version ${p.version}. Export your save before upgrading.`,
    );
  if (
    !p.instances ||
    !Array.isArray(p.packs) ||
    !Array.isArray(p.decks) ||
    !Array.isArray(p.matches) ||
    !Number.isInteger(p.serial) ||
    !p.wallets
  )
    throw Error("Invalid save format. Existing save has not been overwritten.");
  return p as Profile;
}
export class LocalPersistence implements PersistenceAdapter {
  constructor(private storage: StorageLike) {}
  load() {
    const raw = this.storage.getItem(STORAGE_KEY);
    return raw ? deserialize(raw) : undefined;
  }
  save(profile: Profile) {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }
  clear() {
    this.storage.removeItem(STORAGE_KEY);
  }
}
