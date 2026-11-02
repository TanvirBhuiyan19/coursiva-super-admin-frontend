// Format rules shared by the settings form (client-side checks) and the mock API (server-side FormRequest).
// The server stays the authority; these only let the form answer before a round trip.

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function isIpv6(v: string) {
  if (!/^[0-9a-f:]+$/i.test(v) || v.length < 2) return false;
  const doubles = v.split('::').length - 1;
  if (doubles > 1) return false;
  const groups = v.split(':').filter((g) => g !== '');
  if (groups.some((g) => g.length > 4)) return false;
  return doubles === 1 ? groups.length < 8 : groups.length === 8;
}

/** An IPv4/IPv6 address, optionally a CIDR range (`/0–32` or `/0–128`). */
export function isIpOrCidr(value: string) {
  const [addr = '', bits, extra] = value.split('/');
  if (extra !== undefined) return false;
  const v4 = IPV4.test(addr);
  const v6 = !v4 && isIpv6(addr);
  if (!v4 && !v6) return false;
  if (bits === undefined) return true;
  if (!/^\d{1,3}$/.test(bits)) return false;
  return Number(bits) <= (v4 ? 32 : 128);
}

/** A subdomain label: 1–40 of a–z, 0–9 and hyphens, not starting or ending with a hyphen. */
export const isSubdomainLabel = (v: string) => /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(v);

/** An absolute https URL. */
export function isHttpsUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !!u.hostname;
  } catch {
    return false;
  }
}

/** An IANA timezone the runtime knows (e.g. `Europe/London`, `UTC`). */
export function isTimezone(v: string) {
  if (!v) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const isHexColor = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** Splits a one-per-line textarea into trimmed, non-empty, de-duplicated entries. */
export function splitLines(v: string) {
  return [
    ...new Set(
      v
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  ];
}
