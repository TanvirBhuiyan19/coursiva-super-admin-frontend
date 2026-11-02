import { useState, type CSSProperties } from 'react';

/** A finite number clamped to [min, max]; anything else (NaN, Infinity, not a number) becomes `fallback`. */
export const clampNum = (n: unknown, min: number, max: number, fallback = min) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

/**
 * A meter fill that keeps its real size (so the resting visuals are exact) and only animates the change, with transforms:
 * on mount it grows from its start edge (scale 0 → 1); when `size` changes it eases from the old size to the new one
 * (scale old/new → 1). `size` is the same number the fill's width/height uses (any unit, e.g. 0–100 or px).
 * `axis` 'x' fills from the start edge (meters), 'y' rises from the baseline (columns).
 */
export function useGrow(size: number, axis: 'x' | 'y' = 'x'): { className: string; style: CSSProperties } {
  const safe = clampNum(size, 0, Number.MAX_SAFE_INTEGER);
  const [state, setState] = useState(() => ({ size: safe, from: 0, n: 0 }));
  if (state.size !== safe) setState({ size: safe, from: safe > 0 ? clampNum(state.size / safe, 0, 20, 1) : 1, n: state.n + 1 });
  // Alternating keyframe names restart the animation on every change (no reliance on animationend).
  const base = axis === 'y' ? 'fx-grow-y' : 'fx-grow';
  return { className: `${base} ${base}--${state.n % 2 ? 'b' : 'a'}`, style: { '--fx-from': state.from } as CSSProperties };
}
