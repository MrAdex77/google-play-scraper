# Contributing

Thanks for your interest in improving this project. This guide covers the local setup, the conventions the tooling enforces, and how to fix a broken scraper field.

## Prerequisites

- Node.js 22.12 or newer
- [pnpm](https://pnpm.io) 11

## Setup

```
git clone https://github.com/MrAdex77/google-play-scraper.git
cd google-play-scraper
pnpm install
```

## Development workflow

```
pnpm lint            eslint on the whole repo
pnpm typecheck       tsc --noEmit
pnpm test            unit tests, offline against recorded fixtures
pnpm test:coverage   unit tests with coverage thresholds
pnpm test:e2e        live contract tests against play.google.com
pnpm bench           parser benchmarks over recorded fixtures
pnpm build           emit dist/ with esm, cjs, and d.ts
pnpm fixtures:update refresh recorded fixtures from live Google Play
```

Before opening a pull request, make sure `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` and `pnpm build` all pass.

## Benchmarks

`pnpm bench` runs `bench/scriptData.bench.ts` over the three recorded app fixtures. Each fixture measures the production parser in all-block mode, the production parser with the app's derived block selection, and the full offline `app()` pipeline. A name filter works as `pnpm bench -t 'selected blocks'` or `pnpm bench -t 'app() offline'`.

Benchmarks never run in CI: shared runners have noisy neighbors and frequency scaling, so any hz threshold there would flake. For a pull request that touches `src/core/scriptData.ts`, `src/core/spec.ts`, `src/core/path.ts`, or `src/features/app/`, run `pnpm bench` locally on `main`, run it again on your branch, and paste both tables into the PR description.

Benchmarks report performance rather than gate it. Never narrow a declared selection, remove a fallback, weaken a schema, or replace the production parser with a benchmark-only implementation to improve the numbers.

## Conventions

- Commits follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org): `type(scope): subject` with an imperative, lowercase subject of at most 72 characters. Allowed types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `build`, `perf`. commitlint checks every commit.
- Branch names follow the conventional branch spec: `feature/<kebab-slug>`, `bugfix/<kebab-slug>`, `hotfix/<kebab-slug>`, `chore/<kebab-slug>`, `release/<kebab-slug>`.
- TypeScript strict mode, no `any`, no non null assertions, no type assertions in `src/`.
- External data enters as `unknown` and leaves through a zod schema.
- Every feature change ships with unit tests against recorded fixtures and live e2e tests in `e2e/`.
- Live e2e assertions must stay true whatever Google serves today. Assert shape, cross field consistency, and self anchoring counts, never third party catalogue state such as how many similar apps a listing has or whether an app still has no reviews. Two kinds of assertion are allowed to detect external change, regime tripwires and maintained anchor pools, and each one has to be registered in the runbook first. The rules, the exceptions, and the shared invariant helpers are described in [docs/RUNBOOK.md](docs/RUNBOOK.md#live-contract-assertion-rules).
- Versioning, changelog, and npm publishing are automated with Release Please. Do not bump versions or edit the changelog by hand.

## Fixing a broken field

When Google Play changes its page layout, extraction fails with a `SpecError` that lists every broken field and the paths that were tried. [docs/RUNBOOK.md](docs/RUNBOOK.md) walks through the repair step by step. The fix is usually a small diff in one `specs.ts` file plus refreshed fixtures.

## Reporting issues

- For scraper breakage, include the full `SpecError` output, the method called, and the `appId` or options used.
- For everything else, the issue templates will guide you.
