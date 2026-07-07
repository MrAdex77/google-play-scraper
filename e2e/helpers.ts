import { describe } from 'vitest';

const LIVE_TESTS_DISABLED = process.env.GP_E2E === '0';

const REQUESTS_PER_SECOND = 1;

export const liveDescribe = describe.skipIf(LIVE_TESTS_DISABLED);

export const throttled = <Options extends object>(
  options: Options,
): Options & { throttle: number } => ({
  ...options,
  throttle: REQUESTS_PER_SECOND,
});
