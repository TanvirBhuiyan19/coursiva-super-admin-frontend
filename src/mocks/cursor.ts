// Keyset ("before") cursors for newest-first windows — what the API does for threads and notifications.
// Cursor = base64url (no padding) of "{created_at unix seconds}.{id}" of the oldest item returned; `?before=` asks for the
// window just older than it. A malformed cursor is a 422 on `before`.
import { invalid } from './http';

interface Keyed {
  id: string;
  createdAt: string;
}

export interface CursorMeta {
  hasMore: boolean;
  nextCursor: string | null;
}

const seconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

const toBase64Url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const cursorOf = (row: Keyed) => toBase64Url(`${seconds(row.createdAt)}.${row.id}`);

/** The `before` query param as `[unix seconds, id]`, null when absent or blank; 422 when it isn't a cursor. */
export function parseBefore(request: Request): [number, string] | null {
  const raw = (new URL(request.url).searchParams.get('before') ?? '').trim();
  if (!raw) return null;
  if (raw.length > 120) throw invalid({ before: 'The before field must not be greater than 120 characters.' });
  let decoded = '';
  try {
    const b64 = raw.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
    decoded = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  } catch {
    throw invalid({ before: 'The cursor is invalid.' });
  }
  const m = /^(\d{1,12})\.([A-Za-z0-9_]{1,64})$/.exec(decoded);
  if (!m) throw invalid({ before: 'The cursor is invalid.' });
  return [Number(m[1]), m[2]!];
}

/** Newest first by (created_at second, id) — the index order the API reads. */
const newestFirst = (a: Keyed, b: Keyed) => seconds(b.createdAt) - seconds(a.createdAt) || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0);

/**
 * One window of `size` rows, newest first, strictly older than `before` (when given), plus the cursor for the next
 * older window (from the window's oldest row).
 */
export function newestWindow<T extends Keyed>(rows: readonly T[], before: [number, string] | null, size: number) {
  const older = [...rows]
    .sort(newestFirst)
    .filter((r) => !before || seconds(r.createdAt) < before[0] || (seconds(r.createdAt) === before[0] && r.id < before[1]));
  const items = older.slice(0, size);
  const hasMore = older.length > size;
  const meta: CursorMeta = { hasMore, nextCursor: hasMore ? cursorOf(items.at(-1)!) : null };
  return { items, meta };
}
