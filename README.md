# google-play-client

![status](https://img.shields.io/badge/status-under%20construction-orange)

A TypeScript client for scraping public app data from Google Play, built on native `fetch`, `cheerio`, and `zod`.

> **Under construction.** The public API and full documentation land with the first release.

## Testing

Unit tests run offline against recorded fixtures:

```
pnpm test
```

End-to-end tests hit live Google Play. Skip them with the `GP_E2E` guard when you want to run the suite without network access:

```
pnpm test:e2e
GP_E2E=0 pnpm test:e2e
```
