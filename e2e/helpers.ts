import { describe } from 'vitest';
import { createClient } from '../src/index.js';

const LIVE_TESTS_DISABLED = process.env.GP_E2E === '0';

const REQUESTS_PER_SECOND = 1;

export const liveDescribe = describe.skipIf(LIVE_TESTS_DISABLED);

export const liveClient = createClient({ throttle: REQUESTS_PER_SECOND });
