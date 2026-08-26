# Play Store Contract Breakage Runbook

Google Play changes its page structure without notice. When it does, the recorded
fixtures still parse but the live pages no longer match the paths in `specs.ts`.
This runbook turns that break into a fifteen minute patch.

1. **Signal.** The scheduled `Live contract tests` workflow fails and an issue
   labeled `contract-breakage` appears, or users report a `SpecError`. The issue
   names every failing suite in its title and lists each failing test with the
   `SpecError` field lines (broken fields and the paths that were tried) inline,
   so triage starts without opening the run log.

2. **Refresh and reproduce.** Run `pnpm fixtures:update`, then `pnpm test`. The
   failing tests throw `SpecError`s that name every broken field and the paths
   that were tried. Scope the refresh to the features named in the issue title
   with `pnpm fixtures:update <feature>` (for example `pnpm fixtures:update app`)
   to skip re-recording unaffected suites.

3. **Repair the paths.** Open the matching `src/features/<name>/specs.ts`, inspect
   the refreshed fixture (search the expected value in the raw HTML or batch
   payload to find its new indexes), and update only the paths. Prefer appending
   the new path before the old one so both page generations keep working during
   rollout.

4. **Check moved blocks.** When a whole `ds:` block moved, inspect
   `AF_dataServiceRequests` in the refreshed fixture. One RPC ID may bind several
   `ds:` blocks. The parser evaluates every block bound to the declared RPC ID
   and selects the only candidate that passes the root's structural schema. If
   the RPC ID changed, update the root spec's `rpcId`. Do not change it merely
   because the absolute block key moved.

5. **Verify and ship.** Verify with `pnpm test && pnpm test:e2e`, commit as
   `fix(<feature>): repair <field> paths after play store change`, merge, and let
   Release Please cut the patch.

6. **Close out.** Close the breakage issue with a link to the fix commit.

## RPC anchor diagnostics

An `rpc-anchor-fallback` integrity event means no block reached through the
declared RPC ID passed structural validation, but a declared absolute `ds:`
fallback did. Treat the event as an early contract-drift warning even when the
public result still looks correct.

1. Refresh only the affected fixture with `pnpm fixtures:update <feature>` and
   reproduce with `pnpm test`.
2. Inspect `AF_dataServiceRequests` and list every key bound to the event's RPC
   ID. Compare each block with the root schema and the recorded fixture before
   changing the anchor.
3. Update the `rpcId` only when Google changed the stable RPC ID for the same
   response semantics.
4. Update an absolute fallback only after confirming that the new block carries
   the same semantic root. Keep still-valid fallbacks during a rollout.
5. Add or update an in-memory routing mutation that moves the root, reverses
   routing order, and proves no fallback event is emitted on the repaired route.

An ambiguity `ParseError` names two or more routed keys because more than one
candidate passed the structural root schema. Routing-table order must not decide
the winner. Inspect the candidates and tighten the schema around stable root
structure until exactly one validates; do not pick the first key or delete a
valid route to silence the error.

The other integrity reasons have narrower responses:

- `optional-section-parse`: refresh the fixture and inspect the named
  best-effort section. Required fields and roots must still fail loudly.
- `pagination-token-cycle`: preserve the captured request sequence, confirm the
  repeated token, and inspect the pagination response before changing token
  extraction. Tokens must never be written to logs or event messages.

## Live contract assertion rules

The scheduled suite exists to catch scraper breakage, not catalogue movement. An
assertion that fails because Google reshuffled its catalogue files a false
`contract-breakage` issue and trains everyone to ignore the signal. Every
assertion under `e2e/` must therefore stay true no matter what Google serves
today, which leaves six legitimate kinds:

1. **Shape.** A field exists with the right type, a url resolves to the store
   origin, an icon is served over https.
2. **Cross field consistency.** Two fields that come from the same page node
   have to agree: `free` against `price` and `currency`, `score` against
   `scoreText`, `installs` against `minInstalls`, the histogram against the
   rating count, `offersIAP` against `IAPRange`. These are the sharpest
   breakage detectors in the suite because a drifted path breaks the agreement
   immediately while catalogue movement never does.
3. **Self anchoring.** The assertion derives its expectation from the same
   response, for example `list({ num })` returning exactly `num` items or the
   search result set matching the first page it was built from.
4. **Immutable fact.** A release date already in the past, an app id that
   resolves forever, a category id that is part of the taxonomy constant.
5. **Controlled anchor.** A listing this repository's maintainer owns, such as
   `com.adex77.WhereAmI` or the `Adex77` developer id. A change there is a
   deliberate change, not a surprise.
6. **Regime tripwire.** A documented probe of Google's serving behaviour, listed
   under "Pagination tripwires" below.

Never assert third party catalogue state. Concretely, do not pin how many apps
Google recommends for a listing, whether a specific app currently has zero
reviews or zero ratings, whether a category is currently empty, whether a title
is currently in Play Pass, whether a game is still in preregistration, or where
an app ranks for a search term. Assert the invariant that holds in either state
and let the test follow the catalogue.

When a state still deserves live coverage, branch on what the page actually
reports instead of assuming a state:

```ts
if (listing.ratings === undefined) {
  expect(page.data).toEqual([]);
  return;
}
expect(page.data.length).toBeGreaterThan(0);
```

Report which branch ran with vitest's `annotate` so a reader of the run can see
that coverage moved, without the run failing over it.

### Shared invariants

`e2e/contracts.ts` holds the invariant helpers. Reach for them before writing a
bespoke loop of assertions, and add to them when a new cross field agreement
turns up:

- `expectAppItemContract` and `expectAppItemsContract` for search, list, similar
  and developer items.
- `expectListingContract` for a full `app()` result, which composes the offer,
  rating, histogram, installs, purchase and release state invariants.
- `expectReviewContract` and `expectReviewsContract` for review pages.

Two tolerances in that module are measured, not guessed. The histogram tracks
the rating count to within `max(10, 1% of ratings)`, measured across listings
from 31 to 242 million ratings. `scoreText` is the score rounded to one decimal,
so it agrees to within 0.051 once the locale decimal comma is normalized.
Re-measure with `pnpm coverage:live` and a scratch probe before moving either.

### Maintained anchor pools

Three assertions still need at least one anchor to be in a particular state, so
they run against a pool instead of a single listing and fail only when the whole
pool has drifted:

- `PLAY_PASS_CANDIDATES` in `e2e/edgeCases.e2e.test.ts` must keep one title in
  Play Pass.
- `COMMERCIAL_MODEL_BASKET` in `e2e/app.e2e.test.ts` must keep one ad supported
  listing and one with in app purchases.
- `RICH_MEDIA_BASKET` in `e2e/app.e2e.test.ts` must keep one listing filling
  each of the optional media fields.

Their failure messages say "re-anchor the pool". That is a maintenance task, not
a scraper break: replace the drifted ids with listings that are in the wanted
state and commit as `test(e2e): re-anchor the <name> pool`. Never delete the
pool assertion instead, since it is the only live gate on that branch.

`PREREGISTRATION_CANDIDATES` deliberately carries no such gate. Preregistration
listings launch, so the suite asserts the state conditional invariants on each
candidate and annotates how many are still unlaunched. Both branches of the
parser are covered offline in `src/features/app/app.test.ts`, so a fully
launched pool costs live coverage but never fails the run.

Refresh that list from Google's own preregistration shelf, which search does not
surface:

```
https://play.google.com/store/apps/collection/promotion_3000000d51_pre_registration_games?hl=en&gl=us
```

Scrape the `id=` parameters out of that page, confirm `preregister` on a handful
with `app()`, and commit the replacements as
`test(e2e): refresh the preregistration candidates`.

## Pagination tripwires

Two e2e tests pin the current Google Play serving regime instead of the code:

- `confirms google still serves no search continuation token` in
  `e2e/search.e2e.test.ts`
- `confirms the numeric first page still requires a continuation` in
  `e2e/developer.e2e.test.ts`

Three measured page sizes back the count assertions that surround them:
`FIRST_PAGE_SIZE` (150 reviews) in `e2e/iterators.e2e.test.ts`,
`SIMILAR_CLUSTER_PAGE_SIZE` (50 apps) in `e2e/similar.e2e.test.ts`, and
`LIST_CEILING_FLOOR` (150 apps) in `e2e/list.e2e.test.ts`. Each one exists so
that a count assertion proves a continuation was followed rather than pinning
how large a catalogue is. Re-measure the page directly before changing one.

A tripwire failure means Google changed the serving regime, not that the code
broke. The count assertions in the surrounding suites rely on the premises these
tests pin, so re-port the affected contract before touching any threshold.

When the search tripwire fires because a continuation token returned:

1. Open `play.google.com/store/search?q=game&c=apps` in a browser with the
   network panel filtered to `batchexecute` and scroll to the bottom of the
   results.
2. Note the `rpcids` of any request that returns app items. As of July 2026 only
   `teXCtc` fires and it returns related-search chips, not apps, so `teXCtc` is
   the first suspect for a revived pagination RPC.
3. Replay that request to map the item shape, then update
   `SECTIONS_MAPPING.token`, the cluster body builder, and `searchPageItemSpecs`
   together.
4. Only after the continuation parses live, raise the search count assertions
   above 30.

Never satisfy a tripwire by weakening it: thresholds fall under hard rule 11,
so the fix is always a re-port of the contract, never a threshold tweak.

## Coverage gate recalibration

The live suites gate optional fields (`score`, `scoreText`, `summary`,
`currency`, review `text`, `userImage`) through `expectFieldCoverage`, so a
drifted path that stops finding its value fails the daily run with a message
naming the starved field. When a coverage gate fails, first run
`pnpm coverage:live` and read the field's measured ratio:

- **A single field at ~0.0** means a moved path. Fix the matching
  `src/features/<name>/specs.ts` per the steps above and refresh the fixtures
  with `pnpm fixtures:update`. A ratio stuck near the first page's share of the
  result set means only the continuation shape broke, so start at
  `src/core/clusterItem.ts`.
- **A field slightly under its gate across anchors** means catalog drift, not a
  broken path. Lower that field's gate to measured-minus-0.3 in a dedicated
  commit whose body quotes the `coverage:live` report output.

Never delete a gate to green a run (hard rule 11): a gate that no longer holds
is recalibrated from the report data or its contract is re-ported, never
removed.
