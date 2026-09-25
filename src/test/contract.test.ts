// Contract tests: the mock API (the reference implementation) must match docs/openapi.yaml exactly.
// 1. Completeness — every mock route is documented and every documented route exists.
// 2. Responses — every documented endpoint with an example is called and its real JSON validated against the spec.
// Regenerate the spec with `npm run openapi` after changing types or endpoint definitions.
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { RequestHandler } from 'msw';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import specYaml from '../../docs/openapi.yaml?raw';
import { env } from '@/config/env';
import { handlers } from '@/mocks/handlers';
import type { EndpointDef, FeatureSpec } from '@/openapi/dsl';
import { signInAs } from './utils';

type Json = Record<string, unknown>;
interface OpenApi {
  paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, { schema: Json }> }> }>>;
  components: { schemas: Record<string, Json> };
}

const doc = parse(specYaml) as OpenApi;
const modules = import.meta.glob<{ spec: FeatureSpec }>('../features/*/openapi.ts', { eager: true });
const endpoints: (EndpointDef & { feature: string })[] = Object.entries(modules).flatMap(([file, m]) =>
  m.spec.endpoints.map((e) => ({ ...e, feature: /features\/([^/]+)\//.exec(file)?.[1] ?? '?' })),
);

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validatorFor = (schema: Json) => ajv.compile({ ...schema, components: doc.components });

const normalise = (path: string) => path.replace(/\{[^}]+\}/g, '{}').replace(/:[A-Za-z_]+/g, '{}');

describe('OpenAPI completeness', () => {
  const documented = new Set(
    Object.entries(doc.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${normalise(p)}`)),
  );
  const mocked = new Set(
    (handlers as (RequestHandler & { info: { method?: unknown; path?: unknown } })[])
      .map((h) => ({ method: h.info.method, path: h.info.path }))
      .filter(
        (i): i is { method: string; path: string } =>
          typeof i.method === 'string' && typeof i.path === 'string' && i.path.includes(env.apiPrefix),
      )
      .map((i) => `${i.method.toUpperCase()} ${normalise(i.path.split(env.apiPrefix)[1] ?? '')}`),
  );

  it('documents every mock API route', () => {
    expect([...mocked].filter((r) => !documented.has(r)).sort()).toEqual([]);
  });
  it('has a mock implementation for every documented route', () => {
    expect([...documented].filter((r) => !mocked.has(r)).sort()).toEqual([]);
  });
  it('matches the generated spec for every endpoint definition', () => {
    expect(endpoints.length).toBe([...documented].length);
  });
});

describe('OpenAPI responses match the mock API', () => {
  const runnable = endpoints.filter((e) => !e.example?.skip && (e.method === 'GET' || e.example));

  it.each(runnable.map((e) => [`${e.method} ${e.path}`, e] as const))('%s', async (_name, e) => {
    signInAs('Owner');
    const params = e.example?.params ?? {};
    const missing = [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((p) => !(p in params));
    expect(missing, 'add example.params for the path parameters').toEqual([]);
    const path = e.path.replace(/\{(\w+)\}/g, (_, p: string) => encodeURIComponent(params[p]!));
    const qs = new URLSearchParams(Object.entries(e.example?.query ?? {}).map(([k, v]) => [k, String(v)])).toString();
    const res = await fetch(`http://localhost${env.apiPrefix}${path}${qs ? `?${qs}` : ''}`, {
      method: e.method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(e.example?.body !== undefined ? { body: JSON.stringify(e.example.body) } : {}),
    });

    const op = doc.paths[e.path]?.[e.method.toLowerCase()];
    expect(op, 'operation missing from docs/openapi.yaml — run npm run openapi').toBeDefined();
    const success = Object.keys(op!.responses).find((c) => c.startsWith('2'))!;
    const text = await res.text();
    expect(String(res.status), `unexpected status; body: ${text.slice(0, 300)}`).toBe(success);
    if (success === '204') return;

    const content = op!.responses[success]!.content ?? {};
    const mime = Object.keys(content)[0]!;
    expect(res.headers.get('content-type') ?? '').toContain(mime.split(';')[0]!);
    if (mime !== 'application/json') return;
    const validate = validatorFor(content[mime]!.schema);
    const ok = validate(JSON.parse(text));
    expect(ok ? [] : validate.errors?.slice(0, 5).map((err) => `${err.instancePath} ${err.message ?? ''}`)).toEqual([]);
  });
});
