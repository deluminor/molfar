# GPUI sync operational review receipt

Date: 2026-10-27. Verdict: no remaining findings in the final reviewed sync preparation snapshot. This verdict covers the sync tooling and its documented permissions; it does not establish native application, migration, scheduler or release readiness.

Reviewed scope: scripts/gpui-sync/**, .github/gpui-upstream-sync.json, .github/gpui-upstream-unresolved.json, .github/workflows/native.yml, .gitignore and docs/automations/gpui-upstream-sync.md against docs/specs/gpui-sync-preparation/{spec,plan,tasks}.md.

## Fresh verification

- `node --test scripts/gpui-sync/*.test.mjs scripts/gpui-sync/tests/*.test.mjs`: exit 0, 22 tests passed, 0 failed, 0 skipped.
- `node --test /private/tmp/gpui-independent-review.mjs`: exit 0, 6 additional independent integration probes passed, 0 failed, 0 skipped. The harness is preserved beside this receipt as gpui-sync-independent-review-tests.mjs.
- `git diff --check`: no findings. Node syntax checks of the entrypoint and all four runtime modules: exit 0.

The independent probes used temporary local bare repositories only. They verified refusal before candidate push when source changed during the first PR read, refusal before PR creation when source changed during the second read, preservation and exact-head retry after a server-rejected candidate push, reuse after PR creation succeeded but its response was lost, refusal when an observed draft disappeared, and actual exclusion of a second Node process by the common-directory lock.

The final code was also traced for source/attempt ancestry, source reachability in target, source cutover refusal, stable unresolved provenance, unreachable resolution handling without durable promotion, protected packaging/publishing paths, Git environment isolation, symlink checks, competing sync PRs, candidate reuse, final remote checks, explicit no-follow-tags push, mirror refusal, GitHub hostname binding, PR head repository/draft/body verification and absence of merge or protected-ref publication operations. The scratch ignore addition excludes local logs and review artifacts only.

## Reviewed runtime fingerprints (SHA-256)

- run.mjs: e6e2234f5cf5061b1ba322be5f32923ec6dd1babd0605c47b1586577da231686
- lib/channel.mjs: f60dc0cd7d747e0c83661849d2ff287b0c473246d846945c52a9f4f0dbc9c136
- lib/git.mjs: 194e9350e258522346837124efa388c530c5ce5d6850204a241d263ff827ca94
- lib/github.mjs: ce6e0fe4c26cf36f6f4257b71e7c6e7e5368d4f2ceffff831e94350dd949152b
- lib/state.mjs: dc7454a32f034fa67a942aebd99267b5d3d099e7d4d265af8b6ab07213d20b1f
- tracked checkpoint: 79e070712b4ca81141134eea17543f1495acc4ba6c65588e0d2d522872151231
- tracked unresolved snapshot: 48a9f473458f8dbbbedb71640d6f90f6b205b2fcaca1954ba49b2abacec5f315
- native workflow: cba0e09ae981c10ff80865b404a5df8ab1af5dcf7066b9dae3b2db2e4cb54d9b

## Limits

The lock serializes processes sharing one Git common directory. It does not coordinate different clones or machines, nor atomically lock remote GitHub refs. Final remote reads reduce the remaining remote race window; the habit document explicitly requires external serialization for another machine and human recovery after a refusal. No actual GitHub publication, application launch, router access, production profile access, scheduler operation or protected-ref write occurred in this review. Native baseline blockers remain open in the tracked ledger; no integrated or validated checkpoint was advanced.

## Publication preparation follow-up

The reviewed runtime fingerprints remain unchanged. After this review, tracked source.attempted was set to e6f58da15c0f603054bf684b957798941b0e05e0 to record draft PR125 against target ea6c8219. Integrated remains the baseline pair; validated remains null. Five open ledger blockers remain. The six independent probes were promoted into portable scripts/gpui-sync/tests/publication.test.mjs with relative module URLs; no runtime behavior changed. Final aggregate test and coverage evidence is in verification.md and the session report.
