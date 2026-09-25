// Client-only UI state (theme, overlays, toasts). Server data lives in TanStack Query, never here.
import { create } from 'zustand';
import { DEFAULT_BRAND, type UiMode } from '@/theme/themes';

const readLS = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLS = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable — the preference just won't persist */
  }
};

export type ToastTone = 'default' | 'error';
export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface UiState {
  brand: string;
  uiMode: UiMode;
  navOpen: string[];
  mobileNav: boolean;
  cmdOpen: boolean;
  cmdRecent: string[];
  notifOpen: boolean;
  provisionOpen: boolean;
  /** Tenant id currently shown in the read-only impersonation view. */
  impersonating: string | null;
  toasts: Toast[];

  setBrand: (brand: string) => void;
  setUiMode: (mode: UiMode) => void;
  toggleUiMode: () => void;
  set: (patch: Partial<Omit<UiState, 'set'>>) => void;
  toggleNavGroup: (id: string, open?: boolean) => void;
  pushRecent: (label: string) => void;
  toast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;
const TOAST_MS = 3200;

export const useUi = create<UiState>((set, get) => ({
  brand: readLS('sac-brand') ?? DEFAULT_BRAND,
  uiMode: readLS('sac-ui') === 'Dark' ? 'Dark' : 'Light',
  navOpen: ['revenue'],
  mobileNav: false,
  cmdOpen: false,
  cmdRecent: (() => {
    try {
      return JSON.parse(readLS('sac-cmd-recent') ?? '[]') as string[];
    } catch {
      return [];
    }
  })(),
  notifOpen: false,
  provisionOpen: false,
  impersonating: null,
  toasts: [],

  setBrand: (brand) => {
    writeLS('sac-brand', brand);
    set({ brand });
  },
  setUiMode: (uiMode) => {
    writeLS('sac-ui', uiMode);
    set({ uiMode });
  },
  toggleUiMode: () => get().setUiMode(get().uiMode === 'Dark' ? 'Light' : 'Dark'),
  set: (patch) => set(patch),
  toggleNavGroup: (id, open) =>
    set((s) => {
      const isOpen = s.navOpen.includes(id);
      const next = open ?? !isOpen;
      if (next === isOpen) return s;
      return { navOpen: next ? [...s.navOpen, id] : s.navOpen.filter((x) => x !== id) };
    }),
  pushRecent: (label) => {
    const next = [label, ...get().cmdRecent.filter((x) => x !== label)].slice(0, 4);
    writeLS('sac-cmd-recent', JSON.stringify(next));
    set({ cmdRecent: next });
  },
  toast: (message, tone = 'default') => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }].slice(-4) }));
    setTimeout(() => get().dismissToast(id), tone === 'error' ? TOAST_MS * 1.6 : TOAST_MS);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Show a toast from anywhere (mutation callbacks, utilities). */
export const toast = (message: string, tone?: ToastTone) => useUi.getState().toast(message, tone);
