# @mradex77/google-play-scraper

[![npm version](https://img.shields.io/npm/v/@mradex77/google-play-scraper.svg)](https://www.npmjs.com/package/@mradex77/google-play-scraper)
[![CI](https://github.com/MrAdex77/google-play-scraper/actions/workflows/ci.yml/badge.svg)](https://github.com/MrAdex77/google-play-scraper/actions/workflows/ci.yml)
[![Live contract tests](https://github.com/MrAdex77/google-play-scraper/actions/workflows/e2e.yml/badge.svg)](https://github.com/MrAdex77/google-play-scraper/actions/workflows/e2e.yml)
[![license](https://img.shields.io/npm/l/@mradex77/google-play-scraper.svg)](LICENSE)

A modern TypeScript rewrite of the unmaintained [`google-play-scraper`](https://github.com/facundoolano/google-play-scraper). It scrapes public app data from Google Play — app details, search, suggestions, lists, developer pages, similar apps, reviews, permissions, and data safety. Ships as both ESM and CommonJS, returns fully typed results validated with [zod](https://zod.dev), runs on native `fetch` with no runtime HTTP dependency, and isolates every fragile Google Play array path behind a resilient spec layer that is exercised by daily live contract tests.

The public method names, options, and constants match the original library, so migrating is mostly a matter of swapping the import.

## Installation

```
npm install @mradex77/google-play-scraper
```

Requires Node.js 22.12 or newer.

## Quick start

The package exposes named exports and an aggregate default export. Use whichever style you prefer.

```typescript
import gplay from '@mradex77/google-play-scraper';

const app = await gplay.app({ appId: 'com.google.android.apps.translate' });
console.log(app.title, app.score);
```

```typescript
import { app, type App } from '@mradex77/google-play-scraper';

const details: App = await app({ appId: 'com.google.android.apps.translate' });
console.log(details.installs);
```

CommonJS works too:

```javascript
const gplay = require('@mradex77/google-play-scraper').default;

gplay.search({ term: 'panda' }).then((results) => {
  console.log(results.length);
});
```

## Common options

Every method accepts a single options object. These options are available on all of them:

| Option           | Type     | Default | Description                                                                          |
| ---------------- | -------- | ------- | ------------------------------------------------------------------------------------ |
| `lang`           | `string` | `'en'`  | Two letter language code used to fetch the page.                                     |
| `country`        | `string` | `'us'`  | Two letter country code. Needed for apps available only in some regions.             |
| `throttle`       | `number` | none    | Maximum requests per second across a single call.                                    |
| `requestOptions` | `object` | none    | HTTP overrides. See [Throttling and requestOptions](#throttling-and-requestoptions). |

## Methods

- [app](#app) — full detail of a single application
- [search](#search) — apps matching a search term
- [suggest](#suggest) — search term autocompletions
- [list](#list) — a ranked collection of apps
- [developer](#developer) — other apps by the same developer
- [similar](#similar) — apps related to a given app
- [reviews](#reviews) — user reviews for an app
- [permissions](#permissions) — permissions an app requests
- [datasafety](#datasafety) — the data safety section of an app
- [categories](#categories) — the Google Play category taxonomy
- [memoized](#memoized) — a client that caches identical calls

### app

Retrieves the full detail of an application.

| Option  | Type     | Default  | Description                                    |
| ------- | -------- | -------- | ---------------------------------------------- |
| `appId` | `string` | required | The Google Play id (the `?id=` url parameter). |

```typescript
import { app } from '@mradex77/google-play-scraper';

const details = await app({ appId: 'com.google.android.apps.translate' });
```

Returns an `App` with 55 fields. Trimmed:

```javascript
{
  title: 'Google Translate',
  description: 'Translate between up to 133 languages...',
  descriptionHTML: 'Translate between up to 133 languages...<br>...',
  summary: 'Instantly translate text, speech and images in over 100 languages',
  installs: '1,000,000,000+',
  minInstalls: 1000000000,
  score: 4.48,
  scoreText: '4.5',
  ratings: 8765432,
  reviews: 5678901,
  histogram: { '1': 123456, '2': 45678, '3': 90123, '4': 234567, '5': 4567890 },
  price: 0,
  free: true,
  currency: 'USD',
  priceText: 'Free',
  available: true,
  offersIAP: false,
  androidVersion: '8.0',
  androidVersionText: '8.0 and up',
  developer: 'Google LLC',
  developerId: '5700313618786177705',
  developerEmail: 'apps-help@google.com',
  developerWebsite: 'http://support.google.com/translate',
  genre: 'Tools',
  genreId: 'TOOLS',
  categories: [{ name: 'Tools', id: 'TOOLS' }],
  icon: 'https://play-lh.googleusercontent.com/...',
  screenshots: ['https://play-lh.googleusercontent.com/...'],
  contentRating: 'Everyone',
  adSupported: false,
  updated: 1719878400000,
  version: 'Varies with device',
  comments: [],
  appId: 'com.google.android.apps.translate',
  url: 'https://play.google.com/store/apps/details?id=com.google.android.apps.translate'
}
```

### search

Retrieves apps that match a search term.

| Option       | Type                        | Default  | Description                                                   |
| ------------ | --------------------------- | -------- | ------------------------------------------------------------- |
| `term`       | `string`                    | required | The search query.                                             |
| `num`        | `number`                    | `20`     | Number of results, up to `250`.                               |
| `price`      | `'all' \| 'free' \| 'paid'` | `'all'`  | Filter results by price.                                      |
| `fullDetail` | `boolean`                   | `false`  | When `true`, fetch and return the full `App` for each result. |

```typescript
import { search } from '@mradex77/google-play-scraper';

const results = await search({ term: 'panda', num: 5 });
```

Returns `SearchResult[]` (or `App[]` when `fullDetail` is `true`). Trimmed:

```javascript
[
  {
    title: 'Panda VPN',
    appId: 'com.example.pandavpn',
    url: 'https://play.google.com/store/apps/details?id=com.example.pandavpn',
    icon: 'https://play-lh.googleusercontent.com/...',
    developer: 'Panda Labs',
    developerId: '1234567890',
    currency: 'USD',
    price: 0,
    free: true,
    summary: 'Fast and secure VPN',
    scoreText: '4.3',
    score: 4.3,
  },
];
```

### suggest

Given a partial term, returns up to five search completions.

| Option | Type     | Default  | Description               |
| ------ | -------- | -------- | ------------------------- |
| `term` | `string` | required | The partial search query. |

```typescript
import { suggest } from '@mradex77/google-play-scraper';

const suggestions = await suggest({ term: 'pand' });
```

Returns `string[]`:

```javascript
['panda', 'pandora', 'panda vpn', 'panda pop', 'pandora music'];
```

### list

Retrieves a ranked collection of apps, optionally scoped to a category and an age bracket.

| Option       | Type         | Default                | Description                                              |
| ------------ | ------------ | ---------------------- | -------------------------------------------------------- |
| `collection` | `Collection` | `collection.TOP_FREE`  | One of `TOP_FREE`, `TOP_PAID`, `GROSSING`.               |
| `category`   | `Category`   | `category.APPLICATION` | Any [category](#constants) constant.                     |
| `age`        | `Age`        | none                   | One of `age.FIVE_UNDER`, `age.SIX_EIGHT`, `age.NINE_UP`. |
| `num`        | `number`     | `500`                  | Number of results.                                       |
| `fullDetail` | `boolean`    | `false`                | When `true`, return the full `App` for each result.      |

```typescript
import { list, collection, category } from '@mradex77/google-play-scraper';

const items = await list({
  collection: collection.TOP_FREE,
  category: category.GAME,
  num: 5,
});
```

Returns `ListItem[]` (or `App[]` when `fullDetail` is `true`), each shaped like a [search](#search) result.

### developer

Returns other apps published by the same developer. The `devId` is either the numeric developer id or the developer name, exactly as it appears on Google Play.

| Option       | Type      | Default  | Description                                         |
| ------------ | --------- | -------- | --------------------------------------------------- |
| `devId`      | `string`  | required | Numeric developer id or developer name.             |
| `num`        | `number`  | `60`     | Number of results.                                  |
| `fullDetail` | `boolean` | `false`  | When `true`, return the full `App` for each result. |

```typescript
import { developer } from '@mradex77/google-play-scraper';

const apps = await developer({ devId: '5700313618786177705' });
```

Returns `DeveloperApp[]` (or `App[]` when `fullDetail` is `true`), each shaped like a [search](#search) result.

### similar

Returns apps related to a given app.

| Option       | Type      | Default  | Description                                         |
| ------------ | --------- | -------- | --------------------------------------------------- |
| `appId`      | `string`  | required | The Google Play id of the reference app.            |
| `fullDetail` | `boolean` | `false`  | When `true`, return the full `App` for each result. |

```typescript
import { similar } from '@mradex77/google-play-scraper';

const apps = await similar({ appId: 'com.google.android.apps.translate' });
```

Returns `SimilarApp[]` (or `App[]` when `fullDetail` is `true`), each shaped like a [search](#search) result.

### reviews

Retrieves reviews for an app. Reviews always come back inside a `{ data, nextPaginationToken }` envelope so paging is uniform.

| Option                | Type      | Default       | Description                                              |
| --------------------- | --------- | ------------- | -------------------------------------------------------- |
| `appId`               | `string`  | required      | The Google Play id of the app.                           |
| `sort`                | `Sort`    | `sort.NEWEST` | One of `sort.NEWEST`, `sort.RATING`, `sort.HELPFULNESS`. |
| `num`                 | `number`  | `150`         | Number of reviews to fetch.                              |
| `paginate`            | `boolean` | `false`       | When `true`, fetch a single page and return its token.   |
| `nextPaginationToken` | `string`  | none          | Continue from a token returned by a previous call.       |

```typescript
import { reviews, sort } from '@mradex77/google-play-scraper';

const first = await reviews({ appId: 'com.google.android.apps.translate', sort: sort.NEWEST });

if (first.nextPaginationToken) {
  const next = await reviews({
    appId: 'com.google.android.apps.translate',
    paginate: true,
    nextPaginationToken: first.nextPaginationToken,
  });
}
```

Returns `ReviewsResult`. Trimmed:

```javascript
{
  data: [
    {
      id: 'gp:AOqpTOH...',
      userName: 'Ada Lovelace',
      userImage: 'https://play-lh.googleusercontent.com/...',
      date: '2026-06-30T12:00:00.000Z',
      score: 5,
      title: null,
      text: 'Works offline and the camera translation is great.',
      thumbsUp: 42,
      version: '8.9.0',
      criterias: []
    }
  ],
  nextPaginationToken: 'CqYBCqMB...'
}
```

### permissions

Returns the permissions an app requests.

| Option  | Type      | Default  | Description                                                       |
| ------- | --------- | -------- | ----------------------------------------------------------------- |
| `appId` | `string`  | required | The Google Play id of the app.                                    |
| `short` | `boolean` | `false`  | When `true`, return a flat `string[]` of common permission names. |

```typescript
import { permissions } from '@mradex77/google-play-scraper';

const detailed = await permissions({ appId: 'com.google.android.apps.translate' });
const names = await permissions({ appId: 'com.google.android.apps.translate', short: true });
```

Returns `AppPermission[]` (or `string[]` when `short` is `true`):

```javascript
[
  { permission: 'take pictures and videos', type: 0 },
  { permission: 'view network connections', type: 1 },
];
```

The `type` is `permission.COMMON` (`0`) or `permission.OTHER` (`1`).

### datasafety

Returns the data safety section of an app.

| Option  | Type     | Default  | Description                    |
| ------- | -------- | -------- | ------------------------------ |
| `appId` | `string` | required | The Google Play id of the app. |

```typescript
import { datasafety } from '@mradex77/google-play-scraper';

const safety = await datasafety({ appId: 'com.google.android.apps.translate' });
```

Returns `DataSafety`. Trimmed:

```javascript
{
  sharedData: [
    { data: 'Approximate location', optional: false, purpose: 'App functionality', type: 'Location' }
  ],
  collectedData: [
    { data: 'Email address', optional: false, purpose: 'Account management', type: 'Personal info' }
  ],
  securityPractices: [
    { practice: 'Data is encrypted in transit', description: 'Your data is transferred over a secure connection' }
  ],
  privacyPolicyUrl: 'https://policies.google.com/privacy'
}
```

### categories

Returns the Google Play category taxonomy as a list of category ids.

| Option           | Type     | Default | Description                            |
| ---------------- | -------- | ------- | -------------------------------------- |
| `throttle`       | `number` | none    | See [common options](#common-options). |
| `requestOptions` | `object` | none    | See [common options](#common-options). |

```typescript
import { categories } from '@mradex77/google-play-scraper';

const ids = await categories();
```

Returns `string[]`:

```javascript
[
  'APPLICATION',
  'ANDROID_WEAR',
  'ART_AND_DESIGN',
  'AUTO_AND_VEHICLES',
  'GAME',
  'GAME_ACTION',
  'FAMILY',
];
```

### memoized

Returns a client whose methods share an in-memory LRU cache, so identical calls made within the TTL resolve from cache instead of hitting Google Play again.

| Option     | Type     | Default  | Description                                    |
| ---------- | -------- | -------- | ---------------------------------------------- |
| `maxAgeMs` | `number` | `300000` | Time to live per cache entry, in milliseconds. |
| `max`      | `number` | `1000`   | Maximum number of cached entries.              |

```typescript
import { memoized } from '@mradex77/google-play-scraper';

const client = memoized({ maxAgeMs: 60000, max: 500 });

await client.app({ appId: 'com.google.android.apps.translate' });
await client.app({ appId: 'com.google.android.apps.translate' });
```

The returned client exposes every method above plus the exported constants.

## Constants

The library re-exports the same constant sets as the original, frozen and typed.

| Constant     | Values                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `category`   | All app and game categories plus the `FAMILY` set (e.g. `APPLICATION`, `TOOLS`, `GAME`, `GAME_PUZZLE`, `FAMILY`). |
| `collection` | `TOP_FREE`, `TOP_PAID`, `GROSSING`.                                                                               |
| `sort`       | `NEWEST` (`2`), `RATING` (`3`), `HELPFULNESS` (`1`).                                                              |
| `age`        | `FIVE_UNDER` (`'AGE_RANGE1'`), `SIX_EIGHT` (`'AGE_RANGE2'`), `NINE_UP` (`'AGE_RANGE3'`).                          |
| `permission` | `COMMON` (`0`), `OTHER` (`1`).                                                                                    |

```typescript
import { category, collection, sort, age, permission } from '@mradex77/google-play-scraper';
```

## Error handling

Every failure surfaces as a typed subclass of `GooglePlayError`, so you can branch on the exact cause instead of parsing message strings.

| Error             | Extends           | Thrown when                                                                               |
| ----------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `GooglePlayError` | `Error`           | Base class for every error the library throws.                                            |
| `ValidationError` | `GooglePlayError` | The options you passed fail their zod schema.                                             |
| `HttpError`       | `GooglePlayError` | A request fails with a non-success status or a network error. Carries `status` and `url`. |
| `NotFoundError`   | `HttpError`       | Google Play responds `404`, e.g. an unknown `appId`.                                      |
| `RateLimitError`  | `HttpError`       | Google Play responds `429` after retries are exhausted.                                   |
| `BlockedError`    | `GooglePlayError` | A consent wall or captcha interstitial is detected.                                       |
| `ParseError`      | `GooglePlayError` | A batchexecute response cannot be parsed.                                                 |
| `SpecError`       | `ParseError`      | Extraction fails; lists every failing field and the paths that were tried.                |

```typescript
import { app, NotFoundError, SpecError } from '@mradex77/google-play-scraper';

try {
  const details = await app({ appId: 'com.does.not.exist' });
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error('No such app');
  } else if (error instanceof SpecError) {
    console.error('Google Play changed its layout:', error.failures);
  } else {
    throw error;
  }
}
```

## Throttling and requestOptions

Pass `throttle` to cap requests per second, and `requestOptions` to override the HTTP layer:

| requestOptions field | Type                     | Description                                                    |
| -------------------- | ------------------------ | -------------------------------------------------------------- |
| `headers`            | `Record<string, string>` | Extra headers merged into every request.                       |
| `fetchImpl`          | `typeof fetch`           | A custom `fetch` implementation, useful for proxies and tests. |
| `timeoutMs`          | `number`                 | Per-request timeout, up to `120000`. Default `30000`.          |
| `retries`            | `number`                 | Retry count for `429` and `5xx`, `0` to `5`. Default `2`.      |

```typescript
import { app } from '@mradex77/google-play-scraper';

const details = await app({
  appId: 'com.google.android.apps.translate',
  throttle: 5,
  requestOptions: {
    timeoutMs: 15000,
    retries: 3,
    headers: { 'Accept-Language': 'de' },
    fetchImpl: myProxiedFetch,
  },
});
```

Retries use exponential backoff and honor a `Retry-After` header when present.

## Resilience

Google Play serves its data as deeply nested, unlabeled arrays whose positions shift a few times a year. That is what breaks scrapers. Every positional path in this library lives as a typed constant in a per-feature `specs.ts` file, never inline in logic, and each field is resolved through an ordered list of candidate paths so a single moved index does not take the whole call down. Extraction collects all field failures in one pass and throws a single `SpecError` naming every broken field and the paths that were tried, which is exactly the input the maintenance runbook needs. Unknown data enters as `unknown` and only leaves through a zod schema, so a layout change fails loudly at the boundary rather than three layers up.

To catch breakage before users do, the `e2e/` suite runs against live Google Play on a daily GitHub Actions schedule and opens a labeled issue on failure. Repairing a break is a one-file spec diff, walked through step by step in [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Migrating from google-play-scraper

The method names, options, and constants are the same, so most code keeps working after swapping the import. Watch for these differences:

- `reviews` always returns the `{ data, nextPaginationToken }` envelope, never a bare array.
- Dates are ISO 8601 strings (review `date`, `replyDate`), and `updated` is a millisecond timestamp.
- Errors are the typed classes above instead of plain `Error`.
- The package is ESM-first with a CommonJS build; the default export is the aggregate client and named exports are also available.

## Contributing

This project uses [pnpm](https://pnpm.io), [Conventional Commits](https://www.conventionalcommits.org), and the conventional branch spec (`feature/`, `bugfix/`, `chore/`, ...). Versioning, changelog, and npm publishing are automated with Release Please.

```
pnpm install
pnpm lint            eslint on the whole repo
pnpm typecheck       tsc --noEmit
pnpm test            unit tests, offline against recorded fixtures
pnpm test:coverage   unit tests with coverage thresholds
pnpm test:e2e        live contract tests against play.google.com
pnpm build           emit dist/ with esm, cjs, and d.ts
pnpm check:package   build then verify the published package
```

## License

MIT
