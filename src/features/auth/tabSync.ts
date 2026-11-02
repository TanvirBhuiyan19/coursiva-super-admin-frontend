// Cross-tab session sync. Every tab of this browser shares one session cookie, so a sign-in or sign-out in one tab
// changes what the server answers in all of them. The tab that made the change announces the new identity; the others
// react (see SessionExpiry in app/providers.tsx): sign out with it, or drop the previous person's cache and load the new
// session. BroadcastChannel where available, `storage` events otherwise.

export interface SessionSignal {
  /** `null` when the session ended. */
  userId: string | null;
}
interface Envelope extends SessionSignal {
  tab: string;
  at: number;
}

const CHANNEL = 'coursiva-console-session';
const STORAGE_KEY = 'console-session-signal';
/** Identifies this tab, so it ignores its own announcements. */
const TAB = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const hasBroadcast = () => typeof BroadcastChannel !== 'undefined';

function parse(raw: unknown): Envelope | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Partial<Envelope>;
  const idOrNull = (v: unknown) => (typeof v === 'string' && v !== '' ? v : v === null ? null : undefined);
  const userId = idOrNull(m.userId);
  if (typeof m.tab !== 'string' || userId === undefined) return null;
  return { tab: m.tab, at: Number(m.at) || 0, userId };
}

/** Tells the other tabs who is signed in now (and where), or that nobody is. */
export function announceSession(signal: SessionSignal) {
  const message: Envelope = { ...signal, tab: TAB, at: Date.now() };
  if (hasBroadcast()) {
    try {
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage(message);
      channel.close();
      return;
    } catch {
      /* fall through to storage */
    }
  }
  try {
    // A new value every time (`at`, `tab`), so the `storage` event always fires in the other tabs.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
  } catch {
    /* storage unavailable: the other tabs find out at their next request */
  }
}

/** Calls `fn` with each session change another tab announces. Returns an unsubscribe function. */
export function listenSession(fn: (signal: SessionSignal) => void): () => void {
  const deliver = (raw: unknown) => {
    const m = parse(raw);
    if (m && m.tab !== TAB) fn({ userId: m.userId });
  };
  const cleanups: (() => void)[] = [];
  if (hasBroadcast()) {
    try {
      const channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (e: MessageEvent) => deliver(e.data);
      cleanups.push(() => channel.close());
    } catch {
      /* storage events below */
    }
  }
  if (typeof window !== 'undefined') {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        deliver(JSON.parse(e.newValue));
      } catch {
        /* not ours */
      }
    };
    window.addEventListener('storage', onStorage);
    cleanups.push(() => window.removeEventListener('storage', onStorage));
  }
  return () => cleanups.forEach((c) => c());
}
