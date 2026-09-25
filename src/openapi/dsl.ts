// A small, typed way to describe endpoints. Each feature declares its endpoints in `features/<f>/openapi.ts`;
// `npm run openapi` turns them (plus JSON Schemas generated from the feature's `types.ts`) into
// `docs/openapi.yaml`, and `src/test/contract.test.ts` validates the mock API's real responses against it.
// These files are never imported by the app, so they add nothing to the bundle.
import type { Permission } from '../features/auth/permissions';
import type { AuditCategory } from '../lib/domain';

/** A named schema from a feature's `types.ts` (defaults to the declaring feature). */
export interface SchemaRef {
  $type: string;
  feature?: string;
}
/** Inline JSON Schema (for small ad-hoc bodies), written in camelCase like the app types. */
export type InlineSchema = Record<string, unknown>;
export type Schema = SchemaRef | InlineSchema;

export const ref = (name: string, feature?: string): SchemaRef => ({ $type: name, ...(feature ? { feature } : {}) });

export interface ParamDef {
  type: 'string' | 'integer' | 'boolean' | 'number';
  description?: string;
  enum?: readonly (string | number)[];
  required?: boolean;
}

export type ResponseDef =
  | { kind: 'resource'; schema: Schema; status?: 200 | 201 }
  | { kind: 'paginated'; schema: Schema; meta?: InlineSchema }
  | { kind: 'noContent' }
  | { kind: 'file'; mime: string; filename: string };

export const resource = (schema: Schema, status: 200 | 201 = 200): ResponseDef => ({ kind: 'resource', schema, status });
export const paginated = (schema: Schema, meta?: InlineSchema): ResponseDef => ({ kind: 'paginated', schema, ...(meta ? { meta } : {}) });
export const noContent = (): ResponseDef => ({ kind: 'noContent' });
export const file = (mime: string, filename: string): ResponseDef => ({ kind: 'file', mime, filename });

/** Common inline schemas. */
export const arrayOf = (schema: Schema): InlineSchema => ({ type: 'array', items: schema });

export interface EndpointDef {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** OpenAPI path under the API prefix, e.g. `/tenants/{id}`. */
  path: string;
  summary: string;
  description?: string;
  /** Permission the server enforces; 'authenticated' = any signed-in staff user; 'public' = no session. */
  auth: Permission | 'authenticated' | 'public';
  path_params?: Record<string, ParamDef>;
  query?: Record<string, ParamDef>;
  body?: Schema;
  response: ResponseDef;
  /** 422 is added automatically when there is a body; list other notable errors here. */
  errors?: (404 | 409 | 419 | 422)[];
  /** Server-side audit entry written on success. */
  audit?: { text: string; category: AuditCategory };
  /**
   * Values the contract test uses to call this endpoint against the mock API. GET endpoints are always
   * exercised (path params required); mutations are exercised when an example is given.
   */
  example?: { params?: Record<string, string>; query?: Record<string, string | number | boolean>; body?: unknown; skip?: string };
}

export interface FeatureSpec {
  /** Tag shown in the spec (usually the screen area). */
  tag: string;
  description?: string;
  endpoints: EndpointDef[];
}

export const defineSpec = (spec: FeatureSpec) => spec;

/** Standard list parameters (Laravel paginator + Spatie-style sort). */
export const listParams = (sort?: readonly string[]): Record<string, ParamDef> => ({
  page: { type: 'integer', description: 'Page number (1-based).' },
  per_page: { type: 'integer', description: 'Items per page (max 100, default 25).' },
  search: { type: 'string', description: 'Case-insensitive contains search.' },
  ...(sort
    ? { sort: { type: 'string', enum: sort.flatMap((s) => [s, `-${s}`]), description: 'Sort field; prefix with - for descending.' } }
    : {}),
});
