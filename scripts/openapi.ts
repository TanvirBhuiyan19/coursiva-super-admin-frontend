// Generates docs/openapi.yaml from each feature's `openapi.ts` endpoint list + JSON Schemas derived from its
// `types.ts`. The spec describes the wire format (snake_case keys), exactly what the Laravel API must return.
//
//   npm run openapi          → writes docs/openapi.yaml
//   npm run openapi -- --check  → fails if the committed spec is out of date (CI)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGenerator, type Definition } from 'ts-json-schema-generator';
import { createServer } from 'vite';
import { stringify } from 'yaml';
import type { EndpointDef, FeatureSpec, ResponseDef, Schema, SchemaRef } from '../src/openapi/dsl.ts';

const OUT = 'docs/openapi.yaml';
const FEATURES = 'src/features';
const check = process.argv.includes('--check');

type Json = Record<string, unknown>;
const toSnake = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
const pascal = (s: string) => s.replace(/(^|[-_])(\w)/g, (_, __, c: string) => c.toUpperCase());
const isRef = (s: Schema): s is SchemaRef => typeof (s as SchemaRef).$type === 'string';

// ---------- Load endpoint specs through Vite (resolves `@/` aliases) ----------
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const features = readdirSync(FEATURES).filter((f) => existsSync(join(FEATURES, f, 'openapi.ts')));
const specs: { feature: string; spec: FeatureSpec }[] = [];
for (const feature of features) {
  const mod = (await vite.ssrLoadModule(`/${FEATURES}/${feature}/openapi.ts`)) as { spec: FeatureSpec };
  specs.push({ feature, spec: mod.spec });
}
await vite.close();

// ---------- JSON Schemas from types.ts (one generator per feature; definitions built lazily per type) ----------
const generators = new Map<string, ReturnType<typeof createGenerator>>();
const defsByFeature = new Map<string, Record<string, Definition>>();
function definitionOf(feature: string, type: string): Definition | undefined {
  const defs = defsByFeature.get(feature) ?? {};
  defsByFeature.set(feature, defs);
  if (!(type in defs)) {
    let gen = generators.get(feature);
    if (!gen) {
      gen = createGenerator({
        path: join(FEATURES, feature, 'types.ts'),
        tsconfig: 'tsconfig.app.json',
        skipTypeCheck: true,
        expose: 'export',
        topRef: true,
        jsDoc: 'extended',
        additionalProperties: false,
      });
      generators.set(feature, gen);
    }
    try {
      Object.assign(defs, gen.createSchema(type).definitions ?? {});
    } catch {
      return undefined;
    }
  }
  return defs[type];
}

/** Converts a generated JSON Schema to wire format: snake_case property names, OpenAPI $refs. */
function toWire(node: unknown, rename: (name: string) => string): unknown {
  if (Array.isArray(node)) return node.map((n) => toWire(n, rename));
  if (!node || typeof node !== 'object') return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node as Json)) {
    if (k === '$ref' && typeof v === 'string' && v.startsWith('#/definitions/'))
      out.$ref = `#/components/schemas/${rename(decodeURIComponent(v.replace('#/definitions/', '')))}`;
    else if (k === 'properties' && v && typeof v === 'object')
      out.properties = Object.fromEntries(Object.entries(v as Json).map(([p, s]) => [toSnake(p), toWire(s, rename)]));
    else if (k === 'required' && Array.isArray(v)) out.required = (v as string[]).map(toSnake);
    else if (k === '$schema' || k === 'definitions') continue;
    else out[k] = toWire(v, rename);
  }
  return out;
}

// ---------- Components registry (dedupes identical schemas across features) ----------
const components: Record<string, unknown> = {};
const nameFor = new Map<string, string>(); // `${feature}:${type}` → component name
function register(feature: string, type: string): string {
  const key = `${feature}:${type}`;
  const existing = nameFor.get(key);
  if (existing) return existing;
  const def = definitionOf(feature, type);
  if (!def) throw new Error(`Type "${type}" is not exported from ${FEATURES}/${feature}/types.ts`);
  // Reserve the name first (handles recursive references).
  let name = type;
  const wire = () => toWire(def, (dep) => register(feature, dep));
  if (name in components) {
    const candidate = wire();
    if (JSON.stringify(components[name]) === JSON.stringify(candidate)) {
      nameFor.set(key, name);
      return name;
    }
    name = `${pascal(feature)}${type}`;
  }
  nameFor.set(key, name);
  components[name] = {};
  components[name] = wire();
  return name;
}

function schemaOf(s: Schema, feature: string): unknown {
  if (isRef(s)) return { $ref: `#/components/schemas/${register(s.feature ?? feature, s.$type)}` };
  return toWire(resolveInline(s, feature), (dep) => register(feature, dep));
}
/** Inline schemas may embed refs (e.g. arrayOf(ref('X'))). */
function resolveInline(node: unknown, feature: string): unknown {
  if (Array.isArray(node)) return node.map((n) => resolveInline(n, feature));
  if (!node || typeof node !== 'object') return node;
  if (isRef(node as Schema)) return schemaOf(node as SchemaRef, feature);
  return Object.fromEntries(Object.entries(node as Json).map(([k, v]) => [k, resolveInline(v, feature)]));
}

// ---------- Standard pieces ----------
components.PaginationMeta = {
  type: 'object',
  required: ['current_page', 'last_page', 'per_page', 'total', 'from', 'to'],
  properties: {
    current_page: { type: 'integer' },
    last_page: { type: 'integer' },
    per_page: { type: 'integer' },
    total: { type: 'integer' },
    from: { type: ['integer', 'null'] },
    to: { type: ['integer', 'null'] },
  },
};
components.Error = { type: 'object', required: ['message'], properties: { message: { type: 'string' } } };
components.ValidationError = {
  type: 'object',
  required: ['message', 'errors'],
  properties: {
    message: { type: 'string' },
    errors: {
      type: 'object',
      additionalProperties: { type: 'array', items: { type: 'string' } },
      description: 'Field (snake_case, dot notation) → messages.',
    },
  },
};
const errorResponse = (description: string, schema = 'Error') => ({
  description,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } },
});

function successResponse(r: ResponseDef, feature: string) {
  switch (r.kind) {
    case 'noContent':
      return ['204', { description: 'No content.' }] as const;
    case 'file':
      return [
        '200',
        {
          description: `File download (\`${r.filename}\`).`,
          headers: { 'Content-Disposition': { schema: { type: 'string' } } },
          content: { [r.mime]: { schema: { type: 'string' } } },
        },
      ] as const;
    case 'resource':
      return [
        String(r.status ?? 200),
        {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['data'],
                properties: { data: schemaOf(r.schema, feature) },
                additionalProperties: false,
              },
            },
          },
        },
      ] as const;
    case 'paginated': {
      const meta = r.meta
        ? { allOf: [{ $ref: '#/components/schemas/PaginationMeta' }, schemaOf(r.meta, feature)] }
        : { $ref: '#/components/schemas/PaginationMeta' };
      return [
        '200',
        {
          description: 'Paginated list.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['data', 'meta'],
                properties: { data: { type: 'array', items: schemaOf(r.schema, feature) }, meta, links: { type: 'object' } },
              },
            },
          },
        },
      ] as const;
    }
  }
}

function operation(e: EndpointDef, tag: string, feature: string) {
  const params = [
    ...Object.entries(e.path_params ?? {}).map(([name, p]) => ({
      name,
      in: 'path',
      required: true,
      description: p.description,
      schema: { type: p.type, ...(p.enum ? { enum: p.enum } : {}) },
    })),
    ...Object.entries(e.query ?? {}).map(([name, p]) => ({
      name,
      in: 'query',
      required: !!p.required,
      description: p.description,
      schema: { type: p.type, ...(p.enum ? { enum: p.enum } : {}) },
    })),
  ];
  const [status, ok] = successResponse(e.response, feature);
  const responses: Json = { [status]: ok };
  if (e.auth !== 'public') responses['401'] = errorResponse('Not signed in or session expired.');
  if (e.auth !== 'public' && e.auth !== 'authenticated') responses['403'] = errorResponse(`Missing permission \`${e.auth}\`.`);
  if (e.path_params || e.errors?.includes(404)) responses['404'] = errorResponse('Not found.');
  if (e.errors?.includes(409)) responses['409'] = errorResponse('Conflict with the current state.');
  if (e.errors?.includes(419)) responses['419'] = errorResponse('Session or CSRF token expired.');
  if (e.body || e.errors?.includes(422)) responses['422'] = errorResponse('Validation failed.', 'ValidationError');
  const opId = `${e.method.toLowerCase()}${e.path
    .replace(/\{(\w+)\}/g, 'By_$1')
    .split(/[/_-]/)
    .filter(Boolean)
    .map(pascal)
    .join('')}`;
  return {
    operationId: opId,
    tags: [tag],
    summary: e.summary,
    ...(e.description ? { description: e.description } : {}),
    ...(params.length ? { parameters: params } : {}),
    ...(e.body ? { requestBody: { required: true, content: { 'application/json': { schema: schemaOf(e.body, feature) } } } } : {}),
    responses,
    security: e.auth === 'public' ? [] : [{ sanctumSession: [] }],
    ...(e.auth !== 'public' ? { 'x-permission': e.auth } : {}),
    ...(e.audit ? { 'x-audit': e.audit } : {}),
  };
}

// ---------- Assemble ----------
const paths: Record<string, Json> = {};
const tags: Json[] = [];
for (const { feature, spec } of specs.sort((a, b) => a.spec.tag.localeCompare(b.spec.tag))) {
  tags.push({ name: spec.tag, ...(spec.description ? { description: spec.description } : {}) });
  for (const e of spec.endpoints) {
    const item = (paths[e.path] ??= {});
    const method = e.method.toLowerCase();
    if (item[method]) throw new Error(`Duplicate endpoint ${e.method} ${e.path}`);
    item[method] = operation(e, spec.tag, feature);
  }
}

const doc = {
  openapi: '3.1.0',
  info: {
    title: 'Coursiva Platform Console API',
    version: (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version,
    description:
      'Admin API for the Coursiva platform console (Laravel). Generated from the frontend contract — do not edit by hand; run `npm run openapi`.\n\n' +
      'Conventions: snake_case JSON; `{ data }` resources; `{ data, meta }` pagination; 422 `{ message, errors }`; ISO-8601 UTC timestamps; USD amounts. ' +
      'Auth is a Laravel Sanctum SPA session cookie plus the `X-XSRF-TOKEN` header. Every endpoint enforces its `x-permission`; the server writes the `x-audit` entry on success. See docs/api/README.md.',
  },
  servers: [
    { url: 'https://api.coursiva.io/api/v1/admin', description: 'Production' },
    { url: 'http://localhost:8000/api/v1/admin', description: 'Local Laravel' },
  ],
  tags,
  paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))),
  components: {
    securitySchemes: {
      sanctumSession: {
        type: 'apiKey',
        in: 'cookie',
        name: 'laravel_session',
        description:
          'Sanctum SPA session. State-changing requests also send `X-XSRF-TOKEN` (from the `XSRF-TOKEN` cookie set by `GET /sanctum/csrf-cookie`).',
      },
    },
    schemas: Object.fromEntries(Object.entries(components).sort(([a], [b]) => a.localeCompare(b))),
  },
};

const yaml = `# Generated by scripts/openapi.ts — do not edit. Run \`npm run openapi\`.\n${stringify(doc, { lineWidth: 0, aliasDuplicateObjects: false })}`;
const ops = Object.values(paths).reduce((n, p) => n + Object.keys(p).length, 0);
if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== yaml) {
    console.error(`${OUT} is out of date. Run \`npm run openapi\` and commit the result.`);
    process.exit(1);
  }
  console.log(`${OUT} is up to date (${ops} operations, ${Object.keys(components).length} schemas).`);
} else {
  writeFileSync(OUT, yaml);
  console.log(`Wrote ${OUT}: ${ops} operations, ${Object.keys(components).length} schemas.`);
}
