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

4. **Check moved blocks.** When a whole `ds:` block moved, check whether the
   field's `serviceRequestId` anchor resolves; add one when the routing table
   exposes a stable RPC id.

5. **Verify and ship.** Verify with `pnpm test && pnpm test:e2e`, commit as
   `fix(<feature>): repair <field> paths after play store change`, merge, and let
   Release Please cut the patch.

6. **Close out.** Close the breakage issue with a link to the fix commit.

## Pagination tripwires

Two e2e tests pin the current Google Play serving regime instead of the code:

- `confirms google still serves no search continuation token` in
  `e2e/search.e2e.test.ts`
- `confirms the numeric first page still requires a continuation` in
  `e2e/developer.e2e.test.ts`

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
