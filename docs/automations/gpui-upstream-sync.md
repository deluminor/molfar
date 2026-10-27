# MOLFAR GPUI upstream sync — proposed Wisp habit prompt

Status: repository preparation, not an activated schedule. User-supplied scheduler state: Wisp owns habit `dc518d96-d12a-4a47-a06a-da89c00e9305`, Monday 10:00 Europe/Budapest, PAUSED (`enabled=false`, `nextRun=null`). Wisp must verify the reviewed revision and install/enable this prompt only after the checklist below. This preparation session must not create, edit, enable or run habits. Old watch `e9adb3fb` remains untouched and paused.

Assessment and complete M01–M22 inventory: [PR124](https://github.com/deluminor/molfar/pull/124). Original native planning is preserved byte-for-byte under `docs/specs/gpui-sync-preparation/original-planning/`; historical approvals/statuses there do not authorize feature migration.

## Proposed complete habit prompt

You maintain the native MOLFAR upstream review channel. Operate only the reviewed native sync entrypoint `node scripts/gpui-sync/run.mjs`; use `--publish` only after inspection and source-diff review. Never use main's `scripts/upstream/patch-sync.mjs` or its checkpoint.

The preparation checkout is `/Users/deluminor/Documents/personal/developing/personal/projects/AI/molfar-worktrees/molfar-56bca169`. Before using it, verify that its branch/commit contains the accepted preparation changes and the committed entrypoint matches the independently reviewed revision. Do not switch/reset a user checkout. If this checkout is dirty, occupied by another active session, missing, or has not been advanced to the approved native target after the preparation PR is merged, stop and report; obtain/use a dedicated clean operational worktree from `origin/migration/gpui`. Never operate the original dirty `/Users/deluminor/Documents/personal/developing/personal/projects/AI/molfar/.worktrees/gpui-migration`.

Pinned channel:

- Source remote `upstream`: `git@github.com:hardbeat920/monocode.git`, branch `mc/migrate-monocode-to-gpui`.
- Target remote `origin`: `git@github.com:deluminor/molfar.git`, branch `migration/gpui` only.
- Tracked checkpoint `.github/gpui-upstream-sync.json`; tracked unresolved snapshot `.github/gpui-upstream-unresolved.json`.
- Latest manually proposed source: `e6f58da15c0f603054bf684b957798941b0e05e0` against target `ea6c8219bae954a3d8a9e8c536242b9531a683f7`, draft PR125; source attempted records this proposal only.
- Initial integrated pair: source and native target `ea6c8219bae954a3d8a9e8c536242b9531a683f7`. Validated checkpoint is null. Initial observed upstream main is `26465c620977f3951d0a532a0f7db32c3c179007`.

Read checkpoint, unresolved snapshot, prior run report and durable runtime state before deciding there is no work. Run inspection first. Treat script errors as stop conditions; never edit guards/state to make an operation pass. Source SHA equality never closes unresolved items. Preserve stable item IDs, original ranges/paths, disposition and evidence. Runtime unresolved ledger is authoritative across failed attempts; tracked candidate snapshots reconcile by union, with explicit evidence required to resolve an item. Proposed changes may advance attempted state only. Do not advance integrated state until the actual remote target contains the accepted source; do not advance validated state without complete exact-revision validation evidence and separate approval.

Use the entrypoint's atomic Git-common-directory channel lock, shared across worktrees of this repository. Its scope is this local shared repository; no claim of distributed locking. Never delete or steal an existing/stale lock. Report its owner and request recovery after confirming no active owner. Keep candidate worktree and failure evidence. Use the deterministic candidate branch and existing draft PR; never create a competing date-suffixed PR. If an existing candidate differs, stop rather than overwrite/rebase/reset/force it. Check for any open sync PR targeting migration/gpui and final remote source, target and candidate SHAs immediately before publication. A race or unexpected PR/ref requires stopping and reporting.

Before proposing source changes, inspect the complete pinned source range and require ancestry from the integrated checkpoint and any previous attempted source. Refuse rewritten/divergent/unavailable source history or checkpoint not reachable from native target. Verify upstream main; changed main or evidence of GPUI cutover is a reportable review gate, never permission to switch source silently. Changes to publishing/workflow/release owners or credentials require separate review and must be refused by this channel. Do not silently strip files and describe the remainder as fully integrated.

Review MOLFAR-specific deltas: identity, storage, credential/update namespaces, no-UPnP/NAT-PMP, provider/account stale results, STOP/approval/idempotency, original-ID mapping, Board durability/artifacts, Confluence/Jira/Knowledge, Companion and phone contracts. Native upstream baseline still has identity/router parity gaps; preparing a PR does not authorize running it. Preserve M01–M21 obligations; M22 is proposals. Never resolve conflicts by dropping MOLFAR behavior or wholesale ours/theirs. Record each conflict/unported source item durably and stop for review.

Allowed operations: read public refs and PRs; fetch frozen objects into dedicated refs; create a clean isolated candidate branch/worktree; normal commits and non-forced push to that unprotected sync candidate; create/update a draft review PR whose base is exactly migration/gpui; run static/script/synthetic fixture validation and locked development dependency resolution. Keep hooks active and human-only authorship. Verify published PR base/head/body and no attribution. Report when no update exists while retaining unresolved obligations.

Forbidden: merge any PR or branch; push to migration/gpui/main/protected refs/upstream; force, reset, prune, delete or bypass hooks; main history-policy changes, unrelated-history merges or native-tree duplication on main; release/tag/dispatch/sign/publish credentials or workflows; GUI/application launch, installed databases/profiles, real router mappings, product listeners or schedulers; modification of any habit including this one; B7/release-session resumption, local hardening publication or PR123 changes.

Validate with `node --test scripts/gpui-sync/*.test.mjs scripts/gpui-sync/tests/*.test.mjs` and `npm run native:test:dev`. Use the isolated native commands in `docs/specs/gpui-sync-preparation/native-validation.md` for formatting, locked compilation and reviewed synthetic core tests. Never execute GUI tests or product binaries. Record exit status, counts, failures and skips separately; green script tests do not certify native parity. Preserve logs, source/base/head revisions and unresolved ledger paths. Keep source PR draft when required checks or review findings remain unresolved. Never auto merge or mark validated merely because a candidate was proposed or some CI checks passed.

Return a concise Ukrainian report: observed source/target SHAs, attempted/integrated/validated pairs, candidate/PR URL, exact checks with exits/skips, unresolved stable IDs and evidence paths, source cutover/rewrite/race status, and next required human action. If blocked, retain evidence and state that no merge/runtime/scheduler change occurred. Deliver the report to Erik/Wisp through supported session channels; never read private session stores to locate a recipient.

## Activation checklist for Wisp

- [ ] Independently inspect final preparation PR revision, review findings and complete tests; confirm no blocking sync-tooling defect.
- [ ] Preparation PR accepted into migration/gpui by an authorized human; no merge is performed by this habit.
- [ ] Dedicated clean, idle operational checkout contains that exact accepted entrypoint, checkpoint and unresolved snapshot; do not reuse dirty session work without review.
- [ ] Verify remote identities and current source/target ancestry; reconcile any separately accepted source PR without claiming proposed changes integrated/validated.
- [ ] Confirm durable channel state/lock location, permissions, single local shared-repository execution and stale-lock recovery ownership. Additional machines require external serialization.
- [ ] Dry inspection and synthetic concurrency/idempotency/failure tests verified with no production data/runtime.
- [ ] Existing source visual-placement, identity/storage/no-router and release-feed blockers remain visible until separately resolved; no required parity gaps disappear.
- [ ] Wisp verifies habit ID, timezone/DST behavior, Monday 10:00 cadence, permission bounds and final prompt; only Wisp installs/enables under Erik's current authorization.
- [ ] Old watch e9adb3fb remains paused; no automatic merge/release/runtime authority granted.

## Main cutover remains gated

Native and main have independent histories; main currently rejects upstream ancestry. Do not fabricate a merge base or duplicate the native tree on main. After all M01–M21 parity/build/platform/data gates, present Erik a separate main-descendant port or explicitly approved history-policy transition, with exact rollback and no-router/identity evidence. Main promotion requires Erik's separate approval. Upstream's move to main also requires an explicit source-transition review; these are distinct decisions.

## Release blocker retained

The native release job publishes its GitHub release before uploading the mutable feed. A feed failure leaves a published release; its immutable-release guard then rejects ordinary rerun. Safe recovery must verify existing immutable asset bytes and the preserved signed feed before a feed-only retry. This preparation neither removes the guard nor changes/invokes release publication. The blocker remains open for a separate narrow release repair.

## State and recovery paths

The entrypoint resolves `git rev-parse --git-common-dir` and uses its `gpui-sync/` directory: `lock/owner.json`, `attempt.json`, `unresolved.json`, `candidate-<key>.json`, and retained `candidates/<key>/` worktrees. Candidate key is the first 20 SHA-256 hex characters of `<frozen-source>:<frozen-target>`; remote branch is `gpui-sync/<key>`. Different open sync candidates into the target cause refusal. Failed merge worktrees are retained, never auto-resolved or deleted. The separately prepared frozen review candidate is [PR125](https://github.com/deluminor/molfar/pull/125); it deliberately remains draft with an unresolved source defect.

Inspection also acquires the lock, fetches dedicated refs and persists attempted/unresolved evidence; it does not push or create a PR. It refuses a dirty checkout or a checkpoint different from the actual remote target. Before preparation is accepted into migration/gpui, the operational entrypoint cannot run successfully against that target. Synthetic tests are the preparation proof; scheduler readiness is not claimed.

After a human accepts a source update, use a separate reviewed checkpoint change to pair that source with an observed target commit which contains it; verify both ancestry relations. Never store a self-referential current commit SHA. Validated remains null until all required exact-revision gates are approved and evidenced. If source is already reachable but the checkpoint is stale, the entrypoint stops for this reconciliation instead of proposing a redundant merge. Resolution ledger entries require a resolution revision reachable from the target and evidence, retaining immutable originating range/paths.

The final remote checks reduce races but cannot atomically lock GitHub source/target refs or coordinate another machine. Source or target movement at any observed stage requires stopping. Normal exact-ref push uses --no-follow-tags and rejects mirror configuration; GitHub IO pins github.com independently of GH_HOST. Never weaken these controls to bypass a refusal.
