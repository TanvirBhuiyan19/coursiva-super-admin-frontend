import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** Mock API for Vitest (Node). */
export const server = setupServer(...handlers);
