import { defineSpec, ref, resource } from '@/openapi/dsl';
import { OVERVIEW_RANGES } from './types';

export const spec = defineSpec({
  tag: 'Overview',
  description: 'Dashboard headline numbers. Figures only — the client applies labels and colour bands.',
  endpoints: [
    {
      method: 'GET',
      path: '/overview',
      summary: 'Platform overview for a comparison period',
      auth: 'authenticated',
      query: { range: { type: 'string', enum: OVERVIEW_RANGES } },
      response: resource(ref('Overview')),
      example: { query: { range: '90d' } },
    },
  ],
});
