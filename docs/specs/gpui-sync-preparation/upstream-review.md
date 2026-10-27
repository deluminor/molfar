# Frozen GPUI upstream source review

Reviewed range: `ea6c8219bae954a3d8a9e8c536242b9531a683f7..e6f58da15c0f603054bf684b957798941b0e05e0` on 27 October 2026. Scope: all 20 commits and all 49 changed paths, plus inherited release and migration safety boundaries. Application code, workflows, scripts, refs and original planning files were not changed by this review. Only this report and local reproduction evidence under `scratch/source-audit/` were written.

**Disposition: suitable for an explicitly blocked draft source PR into `migration/gpui`; not merge-ready or runtime-ready.** The visual-placement defect below remains unresolved. Publishing a draft must not advance the integrated or validated source checkpoints. No source merge, main promotion, release, application launch or scheduler activation follows from this review.

## Verified history and sensitive-path scope

- `git merge-base --is-ancestor ea6c8219bae954a3d8a9e8c536242b9531a683f7 e6f58da15c0f603054bf684b957798941b0e05e0` exited **0**.
- `git rev-list --count` for the range returned **20**; the complete changed-path list and source-file SHA-256 hashes are in `scratch/source-audit/frozen-range.json`. The complete patch is `scratch/source-audit/frozen.diff`.
- Local `migration/gpui` and its observed `origin/migration/gpui` ref both point to `ea6c8219bae954a3d8a9e8c536242b9531a683f7`. The target is the pristine upstream baseline, with no native MOLFAR feature commits to overwrite. A source update cannot establish preservation of MOLFAR features that have not yet been ported.
- The source range has **no changes** to `.github/`, publishing scripts, manifests or lockfiles, mobile/router code, store implementations, account/credential owners, updater implementations, the remote transport, `src-tauri/`, or the React product tree. No upstream publishing workflow or credential configuration needs to be imported by this range.
- The separately dirty preparation change to `.github/workflows/native.yml` is outside this frozen source range and needs its own preparation review.

The changed behavior consists of Inbox project scoping and stale-detail invalidation; missing-provider runtime hints; session `/stage` and `/commit` routing; native visual placement and dashboard widgets; terminal HTTP(S)/OSC 8 links and Nerd Font selection; settings/sidebar navigation and fitting; saved window size/mode; Windows glass; and initial X11 window-state hints. The deleted visual source/reset surface is an upstream presentation change, not an implementation of MOLFAR HTML artifact parity.

## Confirmed findings

### HIGH — GPUI-UPSTREAM-VISUAL-PLACEMENT

[`crates/monocode-gpui/src/transcript/visuals.rs:18-28`](https://github.com/hardbeat920/monocode/blob/e6f58da15c0f603054bf684b957798941b0e05e0/crates/monocode-gpui/src/transcript/visuals.rs#L18-L28) collects a visual ID from any raw `](visual:id)` substring. It also matches ordinary links, inline code, fenced code, and an image following other paragraph text.

[`transcript.rs:2740-2748`](https://github.com/hardbeat920/monocode/blob/e6f58da15c0f603054bf684b957798941b0e05e0/crates/monocode-gpui/src/transcript.rs#L2740-L2748) adds those IDs to the placed set. [`transcript.rs:3273-3283`](https://github.com/hardbeat920/monocode/blob/e6f58da15c0f603054bf684b957798941b0e05e0/crates/monocode-gpui/src/transcript.rs#L3273-L3283) then suppresses the saved visual's standalone row. However, [`markdown_model.rs:490-499`](https://github.com/hardbeat920/monocode/blob/e6f58da15c0f603054bf684b957798941b0e05e0/crates/monocode-gpui/src/markdown_model.rs#L490-L499) and [`markdown_model.rs:653-682`](https://github.com/hardbeat920/monocode/blob/e6f58da15c0f603054bf684b957798941b0e05e0/crates/monocode-gpui/src/markdown_model.rs#L653-L682) create a visual block only when the paragraph begins with an image. For the four non-embed cases, the replacement block does not exist: a successfully published chart disappears.

Trigger: publish visual `chart-1`, then include `` `![Chart](visual:chart-1)` `` in the answer as a code example without a real embed. The saved visual row is hidden, and the Markdown parser produces zero visual blocks. Ordinary `[Chart](visual:chart-1)`, fenced examples, and `Example: ![Chart](visual:chart-1)` reproduce the same disagreement.

The deterministic harness uses the **actual extracted `placements` function** and a byte-identical copy of the **complete frozen `markdown_model.rs`**, including its existing streaming tests. It does not approximate the Markdown parser. Results:

| Input | Collected ID suppresses standalone row | Replacement visual blocks |
|---|---|---|
| `![Chart](visual:chart-1)` | true | 1 |
| `[Chart](visual:chart-1)` | true | 0 |
| Inline code containing the image syntax | true | 0 |
| Fenced code containing the image syntax | true | 0 |
| `Example: ![Chart](visual:chart-1)` | true | 0 |

Reproduction commands:

```sh
cargo test --offline --manifest-path scratch/source-audit/visual-placement/Cargo.toml -- --nocapture
cargo test --offline --manifest-path scratch/source-audit/visual-placement/Cargo.toml evidence::code_example_must_not_mark_visual_as_placed -- --ignored --exact
```

The first command exited **0**: 6 passed, 1 deliberately ignored failing regression. The second exited **101**, failing `assert!(!placed.contains("chart-1"))`, as expected on the unmodified upstream function. Logs: `scratch/source-audit/visual-placement/{result,expected-failure}.log`.

Resolution needed before merge: derive placement suppression from the same parsed visual blocks used for rendering, and add regressions for literal examples, ordinary links, surrounding prose and incremental transcript updates. No product fix was applied. Keep this stable ID unresolved across retries and unchanged-source runs.

### MEDIUM — inherited native release feed retry blocker

The release workflow is byte-identical at both ends of the reviewed range (`git diff --quiet ... -- .github/workflows/native-release.yml` exited **0**). This is an inherited release blocker, not a regression introduced by these 20 commits.

[`native-release.yml:274-288`](https://github.com/hardbeat920/monocode/blob/e6f58da15c0f603054bf684b957798941b0e05e0/.github/workflows/native-release.yml#L274-L288) rejects already-published previews, publishes the GitHub release at line 285, then uploads the mutable update feed at line 288. If that final upload fails, rerunning the job reaches the immutable-release guard and exits before retrying the feed.

The exact extracted shell step was run twice with local stateful `gh`/`aws` mocks and synthetic package/feed files. No network request, token, signing key, credential configuration or real publishing tool was used.

```sh
python3 scratch/source-audit/release-rerun/reproduce.py
```

Harness exit: **0**. First shell attempt: **42**, after the mocked GitHub release became published and the feed upload failed. Second shell attempt: **1**, with `Published native previews are immutable. Use a new preview tag.` The total number of feed attempts remained **1**. Evidence: `scratch/source-audit/release-rerun/{publish-step.sh,reproduce.py,result.json}`.

Retain the explicit release blocker. A safe repair must verify immutable existing remote package bytes and the signed feed before allowing feed-only recovery; merely removing the guard would weaken publication guarantees. That repair and any release operation remain outside this source-only review.

## MOLFAR delta and historical planning

The original `spec.md`, `plan.md`, `tasks.md`, complete 856-line setup/inventory report, 185-line architecture assessment, and all M01–M22 inventory records were reviewed. All 11 preserved files, including their preservation README, match their PR124 scratch copies by SHA-256. The historical task register still contains **70 `proposed_not_started` implementation/gate units** and `implementationApproved: false`; current preparation approval does not complete those feature tasks. Evidence: `scratch/source-audit/checks.json`.

The earlier stay-on-Tauri recommendation and old PR117/119 pending labels are historical. The current GPUI direction and later merged-PR status corrections in the PR124 assessment govern. The original evidence remains intact.

- **M01:** MOLFAR migration identity/storage/credentials/update isolation remains absent. Frozen native startup still selects MonoCode data (`main.rs:225-293`); no executable was launched.
- **M02–M03:** Provider hints, Git slash commands and terminal links change shared native behavior. They do not establish MOLFAR metadata, cancellation, remote-host, worktree safety or Windows lifecycle parity.
- **M04–M07:** Familiar identity/files/habits/completion reconciliation remains pending. Existing native equivalents are reusable foundations; no schedules were enabled or changed.
- **M08–M11:** Durable Board stages, receipts/gates/artifact handoffs and MOLFAR app-action/STOP contracts remain pending. The new slash commands reuse native session actions and do not implement Board parity.
- **M12–M14:** Inbox project scoping and stale-detail invalidation do not add Jira hierarchy, Confluence or Knowledge/Obsidian parity.
- **M15–M18:** Native chart widgets, window state and glass do not implement the Home/Usage dashboards, copied preference migration, or required cross-platform HTML artifact sandbox behavior. Native visual widgets remain distinct from arbitrary HTML artifacts.
- **M19–M20:** Companion HTTP/Tailscale v2 and native QUIC remain distinct contracts. No-UPnP/NAT-PMP is still a blocker: `mobile/host.rs:65-70` retains `open_router: true`, and `monocode-core/Cargo.toml:33-34` retains `igd-next` and `natpmp`. No router policy was removed, exercised or implicitly accepted.
- **M21:** Merged MOLFAR hardening and six local-only hardening commits still require native semantic reconciliation. This source update neither ports them nor resumes B7.
- **M22:** Board card dependencies, full-text phone search/push and other optional improvements remain proposals, without invented implementation or parity claims.

## Verification limits

This pass proves the pinned history/path scope, preservation of the copied planning evidence, the parser mismatch and the release retry sequence. The visual harness uses cached dependencies offline and runs no GPUI window or product executable. The release harness proves orchestration order, not real signatures, remote asset equality or distribution correctness.

Full native check/build/Clippy/core-test/dependency audit evidence belongs to the separate preparation verification report; this review does not substitute its extracted-function tests for those gates. GUI, runtime, live/copied-user-data migration, platform, accessibility, phone/BitChain interoperability, performance and release validation were not run here. Required unresolved or skipped gates remain blockers.
