import { describe, test } from 'vitest';
import { parseScriptData } from '../src/core/scriptData.ts';
import { createApp } from '../src/features/app/app.ts';
import { appScriptDataSelection } from '../src/features/app/specs.ts';
import { APP_FIXTURES, loadAppFixture } from './fixtures.ts';
import type { AppFixtureName } from './fixtures.ts';

const RUN_OPTIONS = { time: 1000 };

const offlineApp = (html: string) => createApp(() => ({ request: () => Promise.resolve(html) }));

const sink = { total: 0 };

for (const name of Object.keys(APP_FIXTURES) as AppFixtureName[]) {
  const html = loadAppFixture(name);
  const appId = APP_FIXTURES[name];
  const app = offlineApp(html);

  describe(name, () => {
    test('parseScriptData all blocks', async ({ bench }) => {
      await bench('parseScriptData all blocks', () => {
        sink.total += Object.keys(parseScriptData(html).blocks).length;
      }).run(RUN_OPTIONS);
    });

    test('parseScriptData selected blocks', async ({ bench }) => {
      await bench('parseScriptData selected blocks', () => {
        sink.total += Object.keys(parseScriptData(html, appScriptDataSelection).blocks).length;
      }).run(RUN_OPTIONS);
    });

    test('app() offline', async ({ bench }) => {
      await bench('app() offline', async () => {
        const result = await app({ appId });
        sink.total += result.title.length;
      }).run(RUN_OPTIONS);
    });
  });
}
