import {
  app,
  BlockedError,
  category,
  collection,
  createClient,
  createCountryFetch,
  GooglePlayError,
  HttpError,
  memoized,
  NotFoundError,
  ParseError,
  RateLimitError,
  sort,
  SpecError,
  ValidationError,
  type App,
} from '../src/index.js';

type Client = ReturnType<typeof createClient>;

const TEST_APP_ID = 'com.adex77.WhereAmI';
const MISSING_APP_ID = 'com.adex77.this.app.does.not.exist';
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

async function showApps(client: Client): Promise<void> {
  heading('apps()', 'batch details for many ids with per-id failure capture');
  const appIds = [
    TEST_APP_ID,
    'com.instagram.android',
    'com.spotify.music',
    'com.definitely.not.a.real.app',
  ];
  const result = await client.apps({ appIds, concurrency: 3 });
  result.forEach((entry) => {
    if (entry.status === 'fulfilled') {
      field(entry.appId, `fulfilled — ${entry.app.title}`);
    } else {
      field(entry.appId, `rejected — ${entry.error.name}`);
    }
  });
  const fulfilled = result.filter((entry) => entry.status === 'fulfilled').length;
  field('Resolved', `${count(fulfilled)} of ${count(result.length)} (batch still resolved)`);
}

async function showAvailability(client: Client): Promise<void> {
  heading('availability()', 'in which countries an app is published');
  const result = await client.availability({
    appId: TEST_APP_ID,
    countries: ['us', 'pl', 'de'],
  });
  Object.entries(result.countries).forEach(([country, entry]) => {
    const detail = entry.status === 'error' ? `error — ${entry.message}` : entry.status;
    field(country, detail);
  });
}

async function showSearch(client: Client): Promise<void> {
  heading('search()', 'apps matching a query');
  const results = await client.search({ term: SEARCH_TERM, num: 5 });
  field('Matches', results.length);
  results.forEach((item, index) => {
    field(`#${String(index + 1)}`, `${item.title} (${item.appId})`);
  });
}

async function showSuggest(client: Client): Promise<void> {
  heading('suggest()', 'search term autocompletions');
  const suggestions = await client.suggest({ term: 'where am' });
  field('Suggestions', suggestions.join(', ') || 'none');
}

async function showList(client: Client): Promise<void> {
  heading('list()', 'a ranked collection of apps');
  const items = await client.list({
    collection: collection.TOP_FREE,
    category: category.GAME,
    num: 5,
  });
  field('Collection', 'TOP_FREE / GAME');
  items.forEach((item, index) => {
    field(`#${String(index + 1)}`, item.title);
  });
}

async function showCategories(client: Client): Promise<void> {
  heading('categories()', 'the Google Play category taxonomy');
  const ids = await client.categories();
  field('Total categories', ids.length);
  field('Sample', ids.slice(0, 6).join(', '));
}

async function showDeveloper(client: Client, devId: string): Promise<void> {
  heading('developer()', 'other apps by the same developer');
  const apps = await client.developer({ devId, num: 10 });
  field('Developer', devId);
  field('Apps found', apps.length);
  apps.forEach((item, index) => {
    field(`#${String(index + 1)}`, item.title);
  });
}

async function showSimilar(client: Client): Promise<void> {
  heading('similar()', 'apps related to a given app');
  const apps = await client.similar({ appId: TEST_APP_ID });
  field('Similar apps', apps.length);
  apps.slice(0, 5).forEach((item, index) => {
    field(`#${String(index + 1)}`, `${item.title} (${item.appId})`);
  });
}

async function showReviews(client: Client): Promise<void> {
  heading('reviews()', 'user reviews for an app');
  const result = await client.reviews({ appId: TEST_APP_ID, sort: sort.NEWEST, num: 5 });
  field('Fetched', result.data.length);
  field('Next page token', result.nextPaginationToken ?? 'none');
  result.data.slice(0, 3).forEach((review, index) => {
    field(`#${String(index + 1)}`, `${String(review.score)}★ by ${review.userName}`);
  });
}

async function showReviewStreaming(client: Client): Promise<void> {
  heading('reviewsIterator() / reviewsAll()', 'streaming and bulk review reads');
  const streamed: number[] = [];
  for await (const review of client.reviewsIterator({ appId: TEST_APP_ID })) {
    streamed.push(review.score);
    if (streamed.length === 10) {
      break;
    }
  }
  field('Streamed reviews', streamed.length);

  const bulk = await client.reviewsAll({ appId: TEST_APP_ID, maxReviews: 200 });
  field('reviewsAll(maxReviews: 200)', `${count(bulk.length)} reviews collected`);
}

async function showSearchIterator(client: Client): Promise<void> {
  heading('searchIterator()', 'stream search matches page by page');
  const titles: string[] = [];
  for await (const item of client.searchIterator({ term: SEARCH_TERM })) {
    titles.push(item.title);
    if (titles.length === 8) {
      break;
    }
  }
  field('Streamed matches', titles.length);
  titles.forEach((title, index) => {
    field(`#${String(index + 1)}`, title);
  });
}

async function showDeveloperIterator(client: Client, devId: string): Promise<void> {
  heading('developerIterator()', 'stream a developer catalog page by page');
  const titles: string[] = [];
  for await (const item of client.developerIterator({ devId })) {
    titles.push(item.title);
    if (titles.length === 8) {
      break;
    }
  }
  field('Developer', devId);
  field('Streamed apps', titles.length);
  titles.forEach((title, index) => {
    field(`#${String(index + 1)}`, title);
  });
}

async function showPermissions(client: Client): Promise<void> {
  heading('permissions()', 'permissions requested by an app');
  const entries = await client.permissions({ appId: TEST_APP_ID });
  field('Permissions', entries.length);
  entries.slice(0, 8).forEach((entry) => {
    field('•', typeof entry === 'string' ? entry : entry.permission);
  });
}

async function showDataSafety(client: Client): Promise<void> {
  heading('datasafety()', 'the data safety section of an app');
  const safety = await client.datasafety({ appId: TEST_APP_ID });
  field('Shared data types', safety.sharedData.length);
  field('Collected data types', safety.collectedData.length);
  field('Security practices', safety.securityPractices.length);
  field('Privacy policy', safety.privacyPolicyUrl ?? 'none');
}

async function showCountryFetch(): Promise<void> {
  heading('createCountryFetch()', 'route requests to a per-country fetch implementation');
  let usRouteCalls = 0;
  let fallbackRouteCalls = 0;
  const usFetch: typeof fetch = (input, init) => {
    usRouteCalls += 1;
    return fetch(input, init);
  };
  const fallbackFetch: typeof fetch = (input, init) => {
    fallbackRouteCalls += 1;
    return fetch(input, init);
  };
  const routedFetch = createCountryFetch({
    perCountry: { us: usFetch },
    fallback: fallbackFetch,
  });

  const details = await app({
    appId: TEST_APP_ID,
    country: 'us',
    requestOptions: { fetchImpl: routedFetch },
  });

  field('Served by', usRouteCalls > 0 ? 'us route' : 'fallback route');
  field('us route calls', usRouteCalls);
  field('fallback route calls', fallbackRouteCalls);
  field('Title', details.title);
}

async function showErrors(): Promise<void> {
  heading('errors', 'the typed error hierarchy raised on failure');
  const errorTypes = [
    GooglePlayError,
    HttpError,
    NotFoundError,
    RateLimitError,
    BlockedError,
    ParseError,
    SpecError,
    ValidationError,
  ];
  field('Exported error types', errorTypes.map((type) => type.name).join(', '));

  try {
    await app({ appId: MISSING_APP_ID });
    field('Missing app', 'unexpectedly resolved');
  } catch (error) {
    field('Missing app throws', error instanceof NotFoundError ? 'NotFoundError' : message(error));
    field('Is a GooglePlayError', error instanceof GooglePlayError);
  }
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

async function showSharedClient(client: Client): Promise<void> {
  heading('createClient()', 'one shared limiter and defaults across calls');
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

  const client = createClient({ country: 'us', throttle: 1 });

  const details = await run('app()', showApp);
  await run('apps()', () => showApps(client));
  await run('availability()', () => showAvailability(client));
  await run('search()', () => showSearch(client));
  await run('suggest()', () => showSuggest(client));
  await run('list()', () => showList(client));
  await run('categories()', () => showCategories(client));
  if (details) {
    await run('developer()', () => showDeveloper(client, details.developerId));
  }
  await run('similar()', () => showSimilar(client));
  await run('reviews()', () => showReviews(client));
  await run('reviewsIterator()/reviewsAll()', () => showReviewStreaming(client));
  await run('searchIterator()', () => showSearchIterator(client));
  if (details) {
    await run('developerIterator()', () => showDeveloperIterator(client, details.developerId));
  }
  await run('permissions()', () => showPermissions(client));
  await run('datasafety()', () => showDataSafety(client));
  await run('createCountryFetch()', showCountryFetch);
  await run('errors', showErrors);
  await run('memoized()', showMemoized);
  await run('createClient()', () => showSharedClient(client));

  console.log(`\n${divider}\nDone.`);
}

main().catch((error: unknown) => {
  console.error(message(error));
  process.exitCode = 1;
});
