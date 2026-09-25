// In-memory database behind the mock API. Stands in for Laravel + MySQL during frontend development.
// Features register their own collections with `collection()` / `singleton()` so no one edits a central file.
// In the browser the data persists to localStorage so a reload keeps your changes; tests get a fresh copy.
const STORAGE_KEY = 'coursiva-mock-db';
const VERSION = 1;

type Seed<T> = () => T;
interface Registered {
  seed: Seed<unknown>;
}

const registry = new Map<string, Registered>();
let state: Record<string, unknown> = {};
const canPersist = typeof window !== 'undefined' && typeof localStorage !== 'undefined' && import.meta.env.MODE !== 'test';

function loadPersisted(): Record<string, unknown> {
  if (!canPersist) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { v: number; state: Record<string, unknown> };
    return parsed.v === VERSION ? parsed.state : {};
  } catch {
    return {};
  }
}
const persisted = loadPersisted();

function ensure<T>(name: string): T {
  if (!(name in state)) {
    const reg = registry.get(name);
    if (!reg) throw new Error(`Mock collection "${name}" is not registered`);
    state[name] = name in persisted ? persisted[name] : reg.seed();
  }
  return state[name] as T;
}

/** Writes the current state to localStorage (called after every mutating request). */
export function saveDb() {
  if (!canPersist) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, state }));
  } catch {
    /* quota exceeded or storage blocked — the mock just won't persist */
  }
}

/** Restores seed data (tests call this before each test; the dev menu exposes it too). */
export function resetDb() {
  state = {};
  for (const k of Object.keys(persisted)) Reflect.deleteProperty(persisted, k);
  if (canPersist) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export interface Collection<T extends { id: string }> {
  all(): T[];
  find(id: string): T | undefined;
  where(fn: (row: T) => boolean): T[];
  insert(row: T): T;
  update(id: string, patch: Partial<T> | ((row: T) => Partial<T>)): T | undefined;
  remove(id: string): boolean;
  replaceAll(rows: T[]): void;
}

export function collection<T extends { id: string }>(name: string, seed: Seed<T[]>): Collection<T> {
  registry.set(name, { seed });
  const rows = () => ensure<T[]>(name);
  return {
    all: () => rows(),
    find: (id) => rows().find((r) => r.id === id),
    where: (fn) => rows().filter(fn),
    insert: (row) => {
      rows().push(row);
      return row;
    },
    update: (id, patch) => {
      const row = rows().find((r) => r.id === id);
      if (!row) return undefined;
      Object.assign(row, typeof patch === 'function' ? patch(row) : patch);
      return row;
    },
    remove: (id) => {
      const list = rows();
      const i = list.findIndex((r) => r.id === id);
      if (i < 0) return false;
      list.splice(i, 1);
      return true;
    },
    replaceAll: (next) => {
      state[name] = next;
    },
  };
}

export interface Singleton<T> {
  get(): T;
  set(next: T): T;
  patch(p: Partial<T>): T;
}

export function singleton<T extends object>(name: string, seed: Seed<T>): Singleton<T> {
  registry.set(name, { seed });
  return {
    get: () => ensure<T>(name),
    set: (next) => {
      state[name] = next;
      return next;
    },
    patch: (p) => {
      const next = { ...ensure<T>(name), ...p };
      state[name] = next;
      return next;
    },
  };
}

// ---------- helpers shared by seeds ----------
/** ISO timestamp `amount` units before now. */
export function ago(amount: { m?: number; h?: number; d?: number }): string {
  const ms = ((amount.m ?? 0) * 60 + (amount.h ?? 0) * 3600 + (amount.d ?? 0) * 86400) * 1000;
  return new Date(Date.now() - ms).toISOString();
}
/** ISO timestamp `amount` units after now. */
export function fromNow(amount: { m?: number; h?: number; d?: number }): string {
  const ms = ((amount.m ?? 0) * 60 + (amount.h ?? 0) * 3600 + (amount.d ?? 0) * 86400) * 1000;
  return new Date(Date.now() + ms).toISOString();
}

let seq = 0;
/** Short unique id with a type prefix, e.g. `id('tn')` → `tn_lz3k9a1`. */
export function id(prefix: string) {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`;
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
