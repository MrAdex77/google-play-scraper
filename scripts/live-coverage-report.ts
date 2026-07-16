import { coverageReport, type CoverageCounts } from '../e2e/coverage.js';
import { liveClient } from '../e2e/helpers.js';
import { sort } from '../src/index.js';

type Items = readonly Record<string, unknown>[];

interface Anchor {
  name: string;
  fields: readonly string[];
  fetch(): Promise<Items>;
}

const APP_ITEM_FIELDS = ['score', 'scoreText', 'summary', 'currency', 'developerId'];
const REVIEW_FIELDS = ['text', 'userImage', 'version', 'replyText'];
const TRANSLATE_APP_ID = 'com.google.android.apps.translate';
const GOOGLE_DEV_ID = '5700313618786177705';

const anchors: Anchor[] = [
  {
    name: 'search "game" num=100',
    fields: APP_ITEM_FIELDS,
    fetch: async () => await liveClient.search({ term: 'game', num: 100 }),
  },
  {
    name: 'similar translate',
    fields: APP_ITEM_FIELDS,
    fetch: async () => await liveClient.similar({ appId: TRANSLATE_APP_ID }),
  },
  {
    name: 'developer Google num=100',
    fields: APP_ITEM_FIELDS,
    fetch: async () => await liveClient.developer({ devId: GOOGLE_DEV_ID, num: 100 }),
  },
  {
    name: 'list TOP_FREE GAME num=100',
    fields: APP_ITEM_FIELDS,
    fetch: async () =>
      await liveClient.list({
        collection: 'TOP_FREE',
        category: 'GAME',
        num: 100,
      }),
  },
  {
    name: 'reviews translate helpfulness num=150',
    fields: REVIEW_FIELDS,
    fetch: async () => {
      const result = await liveClient.reviews({
        appId: TRANSLATE_APP_ID,
        sort: sort.HELPFULNESS,
        num: 150,
      });
      return result.data;
    },
  },
];

function formatRow(field: string, counts: CoverageCounts): string {
  const filledOverTotal = `${counts.filled.toString().padStart(4)}/${counts.total.toString().padEnd(4)}`;
  return `  ${field.padEnd(12)} ${filledOverTotal} ${counts.ratio.toFixed(2)}`;
}

async function main(): Promise<void> {
  for (const anchor of anchors) {
    const items = await anchor.fetch();
    const report = coverageReport(items, anchor.fields);
    console.log(`${anchor.name} (${items.length.toString()} items)`);
    for (const [field, counts] of Object.entries(report)) {
      console.log(formatRow(field, counts));
    }
    console.log('');
  }
}

main().catch((error: unknown) => {
  process.exitCode = 1;
  throw error;
});
