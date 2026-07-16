import { bench, describe } from 'vitest';
import { parseScriptData } from '../src/core/scriptData.js';
import { extract } from '../src/core/spec.js';
import { createApp } from '../src/features/app/app.js';
import { appSpecs } from '../src/features/app/specs.js';
import { APP_FIXTURES, loadAppFixture } from './fixtures.js';
import type { AppFixtureName } from './fixtures.js';

const offlineApp = (html: string) => createApp(() => ({ request: () => Promise.resolve(html) }));

const sink = { total: 0 };

for (const name of Object.keys(APP_FIXTURES) as AppFixtureName[]) {
  const html = loadAppFixture(name);
  const appId = APP_FIXTURES[name];
  const app = offlineApp(html);
  const data = parseScriptData(html);

  describe(name, () => {
    bench(
      'app() offline',
      async () => {
        const result = await app({ appId });
        sink.total += result.title.length;
      },
      { time: 1000 },
    );

    bench(
      'extract appSpecs',
      () => {
        sink.total += Object.keys(extract(data, appSpecs, 'app')).length;
      },
      { time: 1000 },
    );
  });
}
