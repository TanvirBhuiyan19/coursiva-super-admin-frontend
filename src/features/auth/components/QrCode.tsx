import { encode } from 'uqr';

/**
 * QR code for an `otpauth://` URI, drawn as one SVG path (no innerHTML). Always dark-on-light (`--onFillLight` on
 * `--onFill`, the same in both themes) because some authenticator apps can't read inverted codes.
 */
export function QrCode({ value, label, size = 180 }: { value: string; label: string; size?: number }) {
  const { data, size: n } = encode(value, { ecc: 'M', border: 2 });
  let d = '';
  data.forEach((row, y) => {
    row.forEach((on, x) => {
      if (on) d += `M${String(x)} ${String(y)}h1v1h-1z`;
    });
  });
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${String(n)} ${String(n)}`}
      shapeRendering="crispEdges"
      style={{ background: 'var(--onFill)', borderRadius: 8, display: 'block' }}
    >
      <path d={d} fill="var(--onFillLight)" />
    </svg>
  );
}
