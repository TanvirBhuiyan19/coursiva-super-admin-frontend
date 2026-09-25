// Wire format is snake_case (Laravel convention); application code is camelCase.
// Conversion happens once, in the API client, so features never deal with it.
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const toSnake = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

function transformKeys(value: unknown, fn: (k: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => transformKeys(v, fn));
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[fn(k)] = transformKeys(v, fn);
    return out;
  }
  return value;
}

export const camelizeKeys = <T>(value: unknown): T => transformKeys(value, toCamel) as T;
export const snakeizeKeys = (value: unknown): Json => transformKeys(value, toSnake) as Json;
export { toCamel, toSnake };
