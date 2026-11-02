import { useEffect, useRef, useState, type ReactNode } from 'react';

/** The first number in a formatted value: "$12,340.50", "1.2k", "98%", "-4". */
const NUMBER = /-?\d[\d,]*(\.\d+)?/;
const DURATION = 700;
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

function animatable(value: ReactNode): { prefix: string; target: number; decimals: number; grouped: boolean; suffix: string } | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  const m = NUMBER.exec(text);
  if (!m) return null;
  const raw = m[0];
  const target = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(target) || target === 0) return null;
  return {
    prefix: text.slice(0, m.index),
    target,
    decimals: m[1] ? m[1].length - 1 : 0,
    grouped: raw.includes(','),
    suffix: text.slice(m.index + raw.length),
  };
}

const still = () =>
  import.meta.env.MODE === 'test' ||
  typeof window === 'undefined' ||
  typeof window.matchMedia !== 'function' ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A KPI value that counts up to itself when it first appears (and glides when it changes), keeping its formatting:
 * prefix, thousands separators, decimals and suffix. Anything that isn't a plain formatted number renders as is.
 * Screen readers get the final value only; the rolling digits are hidden from them.
 */
export function CountUp({ value }: { value: ReactNode }) {
  const parts = animatable(value);
  const target = parts?.target ?? 0;
  const from = useRef(0);
  const [shown, setShown] = useState<number | null>(() => (parts && !still() ? 0 : null));

  useEffect(() => {
    if (!parts || still()) {
      setShown(null);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / DURATION);
      const v = origin + (target - origin) * easeOutExpo(t);
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(tick);
      else {
        from.current = target;
        setShown(null);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      from.current = target;
    };
    // Re-run only when the number itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!parts || shown === null) return <>{value}</>;
  const digits = shown.toLocaleString('en-US', {
    minimumFractionDigits: parts.decimals,
    maximumFractionDigits: parts.decimals,
    useGrouping: parts.grouped,
  });
  return (
    <>
      <span aria-hidden="true">
        {parts.prefix}
        {digits}
        {parts.suffix}
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}
