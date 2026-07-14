import {
  app,
  categories,
  category,
  collection,
  createClient,
  datasafety,
  developer,
  list,
  memoized,
  permissions,
  reviews,
  search,
  similar,
  sort,
  suggest,
  type App,
} from '../src/index.js';

const TEST_APP_ID = 'com.adex77.WhereAmI';
const SEARCH_TERM = 'where am i geography quiz';

const divider = '─'.repeat(60);
let step = 0;

function heading(method: string, purpose: string): void {
  step += 1;
  console.log(`\n${String(step)}. ${method} — ${purpose}`);
  console.log(divider);
}

function field(label: string, value: unknown): void {
  console.log(`   ${label}: ${String(value)}`);
}

function money(details: Pick<App, 'free' | 'priceText'>): string {
  return details.free ? 'Free' : details.priceText;
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    console.error(`   ⚠️  ${label} failed: ${message(error)}`);
    return undefined;
  }
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - start };
}

async function showApp(): Promise<App> {
  heading('app()', 'detailed information for a single app');
  const details = await app({ appId: TEST_APP_ID });
  field('Title', details.title);
  field('App ID', details.appId);
  field('Developer', details.developer);
  field(
    'Score',
    `${details.score?.toFixed(2) ?? 'n/a'} / 5 (${count(details.reviews ?? 0)} reviews)`,
  );
  field('Installs', details.installs);
  field('Price', money(details));
  field('Version', details.version);
  field('Genre', details.genre);
  field('Content rating', details.contentRating);
  field('Updated', new Date(details.updated).toDateString());
  field('URL', details.url);
  return details;
}

async function showSearch(): Promise<void> {
  heading('search()', 'apps matching a query');
  const results = await search({ term: SEARCH_TERM, num: 5 });
  field('Matches', results.length);
  results.forEach((item, index) => {
    field(`#${String(index + 1)}`, `${item.title} (${item.appId})`);
  });
}

async function showSuggest(): Promise<void> {
  heading('suggest()', 'search term autocompletions');
  const suggestions = await suggest({ term: 'where am' });
  field('Suggestions', suggestions.join(', ') || 'none');
}

async function showList(): Promise<void> {
  heading('list()', 'a ranked collection of apps');
  const items = await list({
    collection: collection.TOP_FREE,
    category: category.GAME,
    num: 5,
  });
  field('Collection', 'TOP_FREE / GAME');
  items.forEach((item, index) => {
    field(`#${String(index + 1)}`, item.title);
  });
}

async function showCategories(): Promise<void> {
  heading('categories()', 'the Google Play category taxonomy');
  const ids = await categories();
  field('Total categories', ids.length);
  field('Sample', ids.slice(0, 6).join(', '));
}

async function showDeveloper(devId: string): Promise<void> {
  heading('developer()', 'other apps by the same developer');
  const apps = await developer({ devId, num: 10 });
  field('Developer', devId);
  field('Apps found', apps.length);
  apps.forEach((item, index) => {
    field(`#${String(index + 1)}`, item.title);
  });
}

async function showSimilar(): Promise<void> {
  heading('similar()', 'apps related to a given app');
  const apps = await similar({ appId: TEST_APP_ID });
  field('Similar apps', apps.length);
  apps.slice(0, 5).forEach((item, index) => {
    field(`#${String(index + 1)}`, `${item.title} (${item.appId})`);
  });
}

async function showReviews(): Promise<void> {
  heading('reviews()', 'user reviews for an app');
  const result = await reviews({ appId: TEST_APP_ID, sort: sort.NEWEST, num: 5 });
  field('Fetched', result.data.length);
  field('Next page token', result.nextPaginationToken ?? 'none');
  result.data.slice(0, 3).forEach((review, index) => {
    field(`#${String(index + 1)}`, `${String(review.score)}★ by ${review.userName}`);
  });
}

async function showStreaming(): Promise<void> {
  heading('reviewsIterator() / reviewsAll()', 'streaming and bulk review reads');

  let pageFetches = 0;
  const countingFetch: typeof fetch = (input, init) => {
    pageFetches += 1;
    return fetch(input, init);
  };
  const client = createClient({ throttle: 5, requestOptions: { fetchImpl: countingFetch } });

  const streamed: number[] = [];
  for await (const review of client.reviewsIterator({ appId: TEST_APP_ID })) {
    streamed.push(review.score);
    if (streamed.length === 10) {
      break;
    }
  }
  field('Streamed reviews', streamed.length);
  field('Pages fetched before break', pageFetches);

  const bulk = await client.reviewsAll({ appId: TEST_APP_ID, maxReviews: 200 });
  field('reviewsAll(maxReviews: 200)', `${count(bulk.length)} reviews collected`);
}

async function showPermissions(): Promise<void> {
  heading('permissions()', 'permissions requested by an app');
  const entries = await permissions({ appId: TEST_APP_ID });
  field('Permissions', entries.length);
  entries.slice(0, 8).forEach((entry) => {
    field('•', typeof entry === 'string' ? entry : entry.permission);
  });
}

async function showDataSafety(): Promise<void> {
  heading('datasafety()', 'the data safety section of an app');
  const safety = await datasafety({ appId: TEST_APP_ID });
  field('Shared data types', safety.sharedData.length);
  field('Collected data types', safety.collectedData.length);
  field('Security practices', safety.securityPractices.length);
  field('Privacy policy', safety.privacyPolicyUrl ?? 'none');
}

async function showMemoized(): Promise<void> {
  heading('memoized()', 'a client that caches identical calls');
  const client = memoized();
  const first = await timed(() => client.app({ appId: TEST_APP_ID }));
  const second = await timed(() => client.app({ appId: TEST_APP_ID }));
  field('First call', `${first.ms.toFixed(1)} ms (network)`);
  field('Second call', `${second.ms.toFixed(1)} ms (cached)`);
  field('Same result', first.value.title === second.value.title);
}

async function showSharedClient(): Promise<void> {
  heading('createClient()', 'a client that shares one limiter and defaults');
  const client = createClient({ country: 'us', throttle: 2 });
  const { value, ms } = await timed(() =>
    Promise.all([client.app({ appId: TEST_APP_ID }), client.similar({ appId: TEST_APP_ID })]),
  );
  const [details, related] = value;
  field('Default country', details.url.includes('gl=us') ? 'us (inherited)' : 'not inherited');
  field('Similar apps', related.length);
  field('Shared limiter', `2 calls in ${ms.toFixed(0)} ms through one client`);
}

async function main(): Promise<void> {
  console.log(`Google Play client — example run for ${TEST_APP_ID}`);
  const details = await run('app()', showApp);
  await run('search()', showSearch);
  await run('suggest()', showSuggest);
  await run('list()', showList);
  await run('categories()', showCategories);
  if (details) {
    await run('developer()', () => showDeveloper(details.developerId));
  }
  await run('similar()', showSimilar);
  await run('reviews()', showReviews);
  await run('reviewsIterator()/reviewsAll()', showStreaming);
  await run('permissions()', showPermissions);
  await run('datasafety()', showDataSafety);
  await run('memoized()', showMemoized);
  await run('createClient()', showSharedClient);
  console.log(`\n${divider}\nDone.`);
}

main().catch((error: unknown) => {
  console.error(message(error));
  process.exitCode = 1;
});
