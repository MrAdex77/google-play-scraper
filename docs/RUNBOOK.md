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
