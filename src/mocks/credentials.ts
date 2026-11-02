// Server-side rules for pasted credentials, shared by every mock that stores them (media DRM/storage, platform
// connections). Mirrors the backend (backend-golang/docs/connections.md):
// - secrets are write-only: responses carry `configured`, non-secret values, and `last4` only for values of 12+ chars;
// - blank or omitted fields keep their stored value; after merging every required field must be set;
// - credentials are verified with the provider before they are saved (the mock refuses values containing "invalid").
import { invalid } from './http';

export interface CredentialFieldDef {
  key: string;
  label: string;
  secret: boolean;
  optional?: boolean;
  /** The longest value accepted, on one line (default MAX_VALUE, like the backend's Field::maxLength). */
  maxLength?: number;
  /** Returns a validation message for a bad value. */
  check?: (value: string) => string | undefined;
  /** A fixed choice (shown as a switch), like the backend's Field::options. */
  options?: { value: string; label: string }[];
  /** The value in effect while none is stored. */
  default?: string;
}

export interface CredentialDef {
  key: string;
  name: string;
  description: string;
  role: string | null;
  fields: CredentialFieldDef[];
  /** The provider's own check of the merged values: returns why it refuses them (e.g. mismatched environments). */
  verify?: (values: Record<string, string>) => string | undefined;
}

export interface StoredCredentials {
  connection: string;
  values: Record<string, string>;
  verifiedAt: string;
}

/** The default longest credential value (backend Credentials::MAX_VALUE). */
export const MAX_VALUE = 500;

/** The shortest value whose last four characters are shown. */
const HINT_MIN = 12;

export function toConnection(def: CredentialDef, stored: StoredCredentials | undefined) {
  return {
    key: def.key,
    name: def.name,
    description: def.description,
    role: def.role,
    connected: !!stored,
    verifiedAt: stored?.verifiedAt ?? null,
    fields: def.fields.map((fd) => {
      const v = stored?.values[fd.key];
      return {
        key: fd.key,
        label: fd.label,
        secret: fd.secret,
        configured: !!v,
        last4: v && v.length >= HINT_MIN ? v.slice(-4) : null,
        value: fd.secret ? null : (v ?? null),
        options: fd.options ?? null,
        default: fd.default ?? null,
      };
    }),
  };
}

/** Merges submitted values over the stored ones and verifies them; throws a 422 like the backend. */
export function mergeCredentials(def: CredentialDef, stored: StoredCredentials | undefined, input: unknown): Record<string, string> {
  const values: Record<string, string> = { ...stored?.values };
  const errors: Record<string, string> = {};
  const list = Array.isArray(input) ? (input as { field?: unknown; value?: unknown }[]) : [];
  list.forEach((c, i) => {
    const fd = def.fields.find((x) => x.key === c.field);
    if (!fd) {
      errors[`credentials.${i}.field`] = 'Unknown field.';
      return;
    }
    const v = typeof c.value === 'string' ? c.value.trim() : '';
    if (!v) return;
    const max = fd.maxLength ?? MAX_VALUE;
    if (v.length > max || /[\r\n\0]/.test(v))
      errors[`credentials.${fd.key}`] = `The ${fd.label} must be a single line of at most ${max} characters.`;
    else if (fd.check?.(v)) errors[`credentials.${fd.key}`] = fd.check(v)!;
    else values[fd.key] = v;
  });
  for (const fd of def.fields)
    if (!fd.optional && !values[fd.key] && !errors[`credentials.${fd.key}`]) errors[`credentials.${fd.key}`] = `Enter the ${fd.label}.`;
  if (Object.keys(errors).length) throw invalid(errors);
  if (Object.values(values).some((v) => /invalid/i.test(v)))
    throw invalid({ credentials: `${def.name} rejected these credentials: Invalid API Key provided` });
  const refused = def.verify?.(values);
  if (refused) throw invalid({ credentials: `${def.name} rejected these credentials: ${refused}` });
  return values;
}

/** Prefix check, e.g. prefix('secret key', 'sk_live_', 'sk_test_'). */
export const prefix =
  (label: string, ...prefixes: string[]) =>
  (v: string) =>
    prefixes.some((p) => v.startsWith(p)) ? undefined : `The ${label} should start with ${prefixes.join(' or ')}.`;
