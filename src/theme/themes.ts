// Brand themes for the platform console: [name, hue, chroma].
// Every colour in the console is derived from the active theme's hue/chroma in oklch().
export type ThemeDef = readonly [name: string, hue: number, chroma: number];
export type UiMode = 'Light' | 'Dark';

export const THEMES: readonly ThemeDef[] = [
  ['Royal purple', 295, 0.21],
  ['Indigo', 275, 0.19],
  ['Sapphire', 250, 0.17],
  ['Emerald', 158, 0.14],
  ['Teal', 205, 0.13],
  ['Bronze', 65, 0.11],
];

export const DEFAULT_BRAND = 'Royal purple';

export function findTheme(name: string): ThemeDef {
  return THEMES.find((t) => t[0] === name) ?? THEMES[0]!;
}

export function swatch([, h, c]: ThemeDef) {
  return `oklch(0.47 ${c} ${h})`;
}

// Returns the full token map for a brand + mode. Every token referenced in CSS must be defined here.
export function buildTokens(brand: string, mode: UiMode): Record<string, string> {
  const [, H, C] = findTheme(brand);
  const dark = mode === 'Dark';
  const L = (l: number, c: number | string, h: number = H, a?: number) => `oklch(${l} ${c} ${h}${a != null ? ` / ${a}` : ''})`;
  const pick = (light: string, darkVal: string) => (dark ? darkVal : light);

  return {
    '--brandH': String(H),
    '--brandC': String(C),
    // Dark-mode accent is lighter so accent text on dark surfaces meets WCAG AA (4.5:1).
    '--ac': pick(L(0.47, C), L(0.72, (C * 0.75).toFixed(3))),
    '--acH': pick(L(0.4, (C * 0.92).toFixed(3)), L(0.78, (C * 0.7).toFixed(3))),
    '--acT': pick(L(0.955, 0.03), L(0.3, 0.06)),
    '--acNav': L(0.33, 0.1),
    '--acBar': pick(L(0.85, 0.07), L(0.45, 0.08)),
    '--acSh': L(0.47, C, H, 0.28),
    /** Text/icons on accent (and other saturated) backgrounds. */
    '--onAc': pick('white', L(0.17, 0.04)),
    /** Text on opaque heat-map fills (same in both themes): white on dense cells, ink on light cells. */
    '--onFill': 'white',
    '--onFillLight': 'oklch(0.24 0.02 30)',

    '--sb': pick(L(0.19, 0.05), L(0.16, 0.04)),
    '--sbB': L(0.28, 0.05),
    '--sbH': L(0.26, 0.05),
    '--sbB2': L(0.34, 0.05),
    '--sbTx': L(0.82, 0.03),
    '--sbTx2': L(0.62, 0.03),
    '--sbEdge': pick(L(0.3, 0.05), L(0.42, 0.03)),

    '--pg': pick(L(0.975, 0.008), L(0.185, 0.02)),
    '--pg2': pick(L(0.985, 0.005), L(0.22, 0.02)),
    '--card': pick('white', L(0.235, 0.02)),
    '--hov': pick(L(0.972, 0.006), L(0.285, 0.025)),
    '--bd': pick('oklch(0.91 0.008 50)', L(0.44, 0.025)),
    '--bd2': pick('oklch(0.95 0.005 50)', L(0.38, 0.022)),
    '--track': pick('oklch(0.94 0.005 50)', L(0.36, 0.02)),
    '--togOff': pick('oklch(0.85 0.01 50)', L(0.42, 0.02)),

    '--tx': pick('oklch(0.24 0.02 30)', L(0.93, 0.008)),
    '--tx2': pick('oklch(0.45 0.02 35)', L(0.8, 0.01)),
    '--tx3': pick('oklch(0.49 0.02 35)', L(0.77, 0.01)),
    '--tx4': pick('oklch(0.53 0.012 40)', L(0.72, 0.01)),

    '--chipSel': pick('oklch(0.24 0.02 30)', L(0.93, 0.008)),
    '--chipSelFg': pick('white', L(0.2, 0.02)),

    '--scr5': pick(L(0.18, 0.05, H, 0.5), L(0.08, 0.02, H, 0.72)),
    '--scr45': pick(L(0.18, 0.05, H, 0.45), L(0.08, 0.02, H, 0.66)),

    '--gTint': pick('oklch(0.95 0.02 150)', 'oklch(0.34 0.07 150)'),
    '--gFg': pick('oklch(0.42 0.1 150)', 'oklch(0.78 0.13 150)'),
    '--gDot': 'oklch(0.6 0.13 150)',
    '--aTint': pick('oklch(0.96 0.03 70)', 'oklch(0.35 0.07 70)'),
    '--aFg': pick('oklch(0.5 0.1 70)', 'oklch(0.8 0.12 70)'),
    '--aTint2': pick('oklch(0.97 0.02 70 / 0.5)', 'oklch(0.32 0.05 70)'),
    '--aBd': pick('oklch(0.93 0.02 70)', 'oklch(0.45 0.06 70)'),
    '--aDot': 'oklch(0.7 0.14 70)',
    '--rTint': pick('oklch(0.96 0.02 25)', 'oklch(0.34 0.07 25)'),
    '--rFg': pick('oklch(0.5 0.15 25)', 'oklch(0.75 0.13 25)'),
    '--rFg2': pick('oklch(0.45 0.15 25)', 'oklch(0.78 0.12 25)'),
    '--rTint2': pick('oklch(0.97 0.02 25)', 'oklch(0.3 0.06 25)'),
    '--rBd': pick('oklch(0.85 0.05 25)', 'oklch(0.5 0.09 25)'),
    '--rDot': 'oklch(0.55 0.15 25)',
    '--bTint': pick('oklch(0.95 0.02 250)', 'oklch(0.34 0.06 250)'),
    '--bFg': pick('oklch(0.42 0.1 250)', 'oklch(0.75 0.1 250)'),

    '--shCard': '0 1px 2px oklch(0.32 0.06 280 / 0.05), 0 10px 30px oklch(0.32 0.06 280 / 0.04)',
    '--shPop': '0 16px 44px oklch(0 0 0 / 0.14)',
    '--shModal': '0 28px 70px oklch(0 0 0 / 0.55)',
    '--shDrawer': '-12px 0 40px oklch(0 0 0 / 0.18)',
    '--shToast': '0 12px 34px oklch(0 0 0 / 0.4)',

    '--cscheme': dark ? 'dark' : 'light',
  };
}

export function applyTokens(brand: string, mode: UiMode) {
  const tokens = buildTokens(brand, mode);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v);
  root.style.colorScheme = mode === 'Dark' ? 'dark' : 'light';
  root.dataset.theme = mode === 'Dark' ? 'dark' : 'light';
}
