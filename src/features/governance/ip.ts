// IP / CIDR validation shared by the block-IP form (zod) and the mock API (FormRequest rule).

const V4_OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const V4 = new RegExp(`^${V4_OCTET}(\\.${V4_OCTET}){3}$`);

export function isIPv4(s: string) {
  return V4.test(s);
}

export function isIPv6(s: string) {
  if (!s.includes(':') || !/^[0-9a-fA-F:.]+$/.test(s)) return false;
  // An embedded IPv4 tail (e.g. ::ffff:192.0.2.1) counts as two groups.
  let groups = s;
  let extra = 0;
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!isIPv4(tail)) return false;
    groups = s.slice(0, lastColon + 1) + '0';
    extra = 1;
  }
  const halves = groups.split('::');
  if (halves.length > 2) return false;
  const parts = (h: string) => (h === '' ? [] : h.split(':'));
  const head = parts(halves[0] ?? '');
  const rest = halves.length === 2 ? parts(halves[1] ?? '') : [];
  if (![...head, ...rest].every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return false;
  const count = head.length + rest.length + extra;
  return halves.length === 2 ? count < 8 : count === 8;
}

/** IPv4, IPv6, or either with a CIDR prefix (/0–32 for IPv4, /0–128 for IPv6). */
export function isIpOrCidr(input: string) {
  const s = input.trim();
  const [addr = '', prefix, more] = s.split('/');
  if (more !== undefined) return false;
  const v4 = isIPv4(addr);
  const v6 = !v4 && isIPv6(addr);
  if (!v4 && !v6) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (v4 ? 32 : 128);
}

export const IP_ERROR = 'Enter a valid IPv4 or IPv6 address, or a CIDR range such as 198.51.100.0/24.';
