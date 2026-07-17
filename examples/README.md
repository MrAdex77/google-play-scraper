# Examples

Runnable demonstrations of every public method in `google-play-client`.

## all-methods.ts

Invokes each method against a real app (`com.adex77.WhereAmI`) and prints the
results to the console.

```
pnpm example
```

The script touches live Google Play, so it needs network access and the output
depends on current store data. Most sections run through one shared
`createClient({ country: 'us', throttle: 1 })` client, while `app()`,
`createCountryFetch()`, `errors`, and `memoized()` use the plain top-level
imports to show both styles. Sections run independently — if one fails the
others still run.

| Section                              | What it shows                                   |
| ------------------------------------ | ----------------------------------------------- |
| `app()`                              | Full details for a single app by `appId`        |
| `apps()`                             | Batch details for many ids with per-id failures |
| `availability()`                     | In which countries an app is published          |
| `search()`                           | Apps matching a query                           |
| `suggest()`                          | Search term autocompletions                     |
| `list()`                             | A ranked collection (`TOP_FREE` / `GAME`)       |
| `categories()`                       | The Google Play category taxonomy               |
| `developer()`                        | Other apps by the same developer                |
| `similar()`                          | Apps related to a given app                     |
| `reviews()`                          | User reviews, sorted newest first               |
| `reviewsIterator()` / `reviewsAll()` | Streaming and bulk review reads                 |
| `searchIterator()`                   | Streaming search matches page by page           |
| `developerIterator()`                | Streaming a developer catalog page by page      |
| `permissions()`                      | Permissions requested by an app                 |
| `dataSafety()`                       | The data safety section of an app               |
| `createCountryFetch()`               | Routing requests to a per-country fetch         |
| `errors`                             | The typed error hierarchy raised on failure     |
| `memoized()`                         | A client that caches identical calls            |
| `createClient()`                     | One shared limiter and defaults across calls    |

Every method is also available on the aggregate default export:

```ts
import gplay from 'google-play-client';

const details = await gplay.app({ appId: 'com.adex77.WhereAmI' });
```
