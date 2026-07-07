# Examples

Runnable demonstrations of every public method in `google-play-client`.

## all-methods.ts

Invokes each method against a real app (`com.adex77.WhereAmI`) and prints the
results to the console.

```
pnpm example
```

The script touches live Google Play, so it needs network access and the output
depends on current store data. Methods run independently — if one fails the
others still run.

| Method          | What it shows                             |
| --------------- | ----------------------------------------- |
| `app()`         | Full details for a single app by `appId`  |
| `search()`      | Apps matching a query                     |
| `suggest()`     | Search term autocompletions               |
| `list()`        | A ranked collection (`TOP_FREE` / `GAME`) |
| `categories()`  | The Google Play category taxonomy         |
| `developer()`   | Other apps by the same developer          |
| `similar()`     | Apps related to a given app               |
| `reviews()`     | User reviews, sorted newest first         |
| `permissions()` | Permissions requested by an app           |
| `datasafety()`  | The data safety section of an app         |
| `memoized()`    | A client that caches identical calls      |

Every method is also available on the aggregate default export:

```ts
import gplay from 'google-play-client';

const details = await gplay.app({ appId: 'com.adex77.WhereAmI' });
```
