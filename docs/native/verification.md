# Native verification

Status recorded on October 22, 2026, on macOS Apple Silicon. These are local
results, not a release certification. Later dated sections supplement this
snapshot. See [preview limitations](parity.md) for
remaining runtime and platform work.

## MOLFAR sync and merge follow-up — November 2, 2026

Verified revision: [`60bbd2c6`](https://github.com/deluminor/molfar/commit/60bbd2c6b8b7e5e72914829f73b99fe209a39ac4).
The migration line includes upstream main through `12552dc8b919` and MOLFAR
main through the v1.0.22 release (`96b2f64c`). Desktop sync #131 was merged;
#127 remains an open migration PR, ready for review by the user's decision.

| Evidence | Result and scope |
| --- | --- |
| Local `npm run check:web` and final pre-push web gate | Exit 0; 7,145 passed, 13 skipped; types, lint, size, boundaries, move map and native branding passed |
| Local `npm run native:check` before the version-only release merge | Exit 0; 31 Node tests, formatting and strict Clippy, 746 core passed / 2 ignored, 827 GPUI passed / 11 ignored, 6 wheel regression tests passed |
| Release checks after the v1.0.22 merge | `npx vitest run scripts/release/`: exit 0, 31 passed; only release metadata changed after the native gate |
| Exact-head GitHub CI | All 21 reported checks succeeded, including core on Linux/macOS/Windows, native macOS tests/build and production CI |
| Windows prompt regression | CRLF fixture reproduced the original assertion failure; a narrow LF checkout rule fixes it without changing the prompt builder, assertion or fixture content; both Windows Core jobs succeeded |
| Preservation | Native, Board and connector source blobs were unchanged by the main-merge follow-up; independent source review found no blocker in those merge resolutions |

Exact-head runs: [production CI](https://github.com/deluminor/molfar/actions/runs/41410792691),
[native push CI](https://github.com/deluminor/molfar/actions/runs/41410784771),
[native PR CI](https://github.com/deluminor/molfar/actions/runs/41410792694).
The first sandboxed native attempt failed 14 local socket/process fixtures with
`Operation not permitted`; the complete permitted rerun passed. This was an
environment restriction, not a waived test failure.

The sync also added six wheel regressions for reset, programmatic positioning,
input distance and reversed/replaced glides. Phone and Familiar changes are
summarized in the [sync notes](https://github.com/deluminor/molfar/pull/127#issuecomment-6566938149).
New or missing native Familiar settings default to a 30-minute inactivity
heartbeat; disable Heartbeat in Familiar settings to retain no periodic wake-up.
No running configuration was activated by the sync.

No application, browser, device, live provider or real user-data QA was performed
for this sync/follow-up. Green CI does not close [feature/runtime gaps](parity.md).
Historical results below retain their dates; upstream reference results do not
certify the MOLFAR branch.

## Recorded results

| Check | Result |
| --- | --- |
| Complete native check (`npm run native:check`) | Passed |
| Native script tests (`npm run native:test:dev`) | 19 passed, including development restarts, bundle data modes and dependency guards |
| Native Rust formatting and strict Clippy | Passed for core and GPUI, including all targets |
| Native core tests | 547 passed, 1 ignored |
| GPUI tests | 551 passed, 11 ignored |
| Editor asset regeneration and smoke checks | Passed, including large-file diff highlighting |
| Remote checks | 50 core tests, 25 native runtime/UI tests, Connections and secret-input regressions passed; isolated Node-host and loopback SSH fixtures also passed |
| Host suite | 112 passed, 6 skipped |
| Production frontend | 5,560 tests passed, 13 skipped; TypeScript and production build passed under Node 24 |
| Production Rust workspace | 698 tests passed, 1 SSH fixture ignored; formatting and strict Clippy passed |
| Production macOS packaging | Tauri release `.app` built and its local ad-hoc signature verified |
| Native macOS commands | `native:dev` built and launched; `native:build` produced an optimized app without launching it; both bundle signatures verified |
| Native database defaults | M01 dev path contract tests passed; read-only `--check-data` read 323 sessions from a desktop DB copy; six shared-schema tables had no missing columns |
| Native UI and chat | Provider order, live Codex streaming, Stop, saved history after relaunch, resumed provider context, and file preview/source passed |
| Native release UI | Restored existing workspace and conversation history from a consistent production database snapshot |
| macOS notifications | Reminder appeared in Notification Center; opening it returned from Settings to the matching chat and cleared the reminder |

The ignored tests require explicit SSH/host fixtures, a Metal device or a manual
frame-cost measurement. Cargo still reports an upstream future-compatibility
advisory for `block 0.1.6`. The preview workflow has not been run as part of these
local checks. Linux/Windows GUI checks and broad live-provider verification
remain outstanding.

Production source, lockfiles and release workflows were checked against `main`;
the native dependency graph remains separate. Live provider requests used the
development database and a temporary project. The release GUI used a disposable
production snapshot with background agents and automations disabled; only the
read-only data check opened the live production database. Notification delivery
used a separate test bundle identity. Notification sounds, Dock badges and
completion/approval alerts were not manually checked.

Reopening Tauri after native use of the live production database remains a manual
check. Concurrent shared-data startup, scheduled tasks and phone connections
remain unverified and deferred.

## Desktop preference migration — October 23, 2026

On Linux, all 27 automated desktop preference tests and strict core Clippy (`--all-targets`,
`--profile native-dev`, `-D warnings`) passed. The installed Linux WebKitGTK
preference store was readable. Synthetic fixtures verified that WebView2 reads
preserve source filenames and contents with the source database both open/locked
and closed, and that empty origins do not hide saved preferences. A WebKitGTK
fixture also verified eight saved projects reach the restored native workspace.
The full core suite passed serially: 557 passed, 1 ignored. The initial parallel
run failed two provider-process fixtures; both passed in a serial rerun and in
the full serial suite.

The Windows-only module's conditional-compilation path passed an isolated
`-D warnings` check on Linux. This was not a native Windows build. Real WebView2
profile compatibility, a Windows build and Windows execution remain unverified.
Copies of actively written LevelDB files are best-effort and may be incomplete
or unreadable; close Tauri before first-launch preference restoration.

The installed-profile integration test is ignored by default because it reads
personal storage. To run that read-only check explicitly:

```sh
cargo test --manifest-path crates/molfar-gpui/Cargo.toml --locked -p molfar-core --profile native-dev installed_desktop_dir_reads -- --ignored
```

## Preview 1 candidate — October 25, 2026

The [native CI run for `b106d32b`](https://github.com/hardbeat920/monocode/actions/runs/40185511105)
passed. It checked core on macOS, Linux and Windows, and formatting, strict
Clippy, tests and a GUI build on macOS. The same revision passed all 657 GPUI
tests locally, with 11 ignored, plus formatting and strict Clippy. Local fixture
tests required access to loopback networking, file watching and process sampling.

A Linux ARM64 source build was launched and exercised in an Ubuntu 24.04 Noodle
VM. Rust 1.98 avoided a compiler failure with Rust 1.99.1, and a VM-specific
shared-memory workaround with software OpenGL enabled rendering. This was a
launch/UI smoke test, not live provider or packaged Linux x64 upgrade coverage.

Packaged preview-to-preview updates, Windows GUI execution, and macOS
completion/approval alerts, sounds and Dock badges still need runtime testing.

## Windows title bar — October 27, 2026

On Windows 10 22H2 x64, a `native-dev` build was launched and its title bar
exercised by hand. The window showed one bar, the app's tab row. Dragging it
moved the window, double-clicking it maximized and restored the window, and
dragging it to the screen's edge snapped the window to half the screen. The
edges and corners resized the window. Minimize, maximize/restore and close
worked. `WM_NCHITTEST` returned the caption for the bar's empty parts, the
client area for tabs and buttons, the caption buttons for the window controls
and the resize edges for the frame.

All 684 GPUI tests ran serially: 668 passed and 16 failed. The same 16 failed
on `f23cb29c` without these changes, in file-link, worktree, terminal and
pane-layout fixtures. Core tests (589 passed, 2 ignored), native script tests
and formatting passed. Strict Clippy failed on existing compiler warnings in
unrelated files of the Windows build.

Client-decorated Linux and the Windows 11 Snap Layouts flyout were not checked.

## MOLFAR Board creation and turn receipts — October 29, 2026

The MOLFAR migration branch passed `npm run native:check`: 642 core tests,
735 GPUI tests and 31 native script tests, plus formatting and strict Clippy.
Two core and eleven GPUI manual/platform tests remain ignored. Another 43
upstream/release tests passed, along with native branding, rename routing and
source-size checks.

`npm run native:build` produced an optimized, locally signed macOS app without
launching it. Synthetic fixtures cover Board creation and retry repair, typing,
IME, focus, reduced motion and mounted refresh content. Receipt fixtures cover
immutable success/failure/cancel provenance, exact full output, stale data and an
actual final transcript-write failure using a mock provider and test database.
Independent source review found no remaining behavioral issue.

These checks cover creation and the receipt/data prerequisite. Native Board
stage execution remains pending. No actual app/browser/device QA, live provider
requests, production-data writes, Linux/Windows runtime checks or release action
were performed. The production React/Tauri source was unchanged.

## Upstream reference evidence

The following results were reported by the upstream repository; they are not verification of the MOLFAR migration branch.

## Preview 10 candidate — October 29, 2026

The code at [`bc8c73da`](https://github.com/hardbeat920/monocode/commit/bc8c73daa3eeea03171a402ecdca5f1d1f7e89e7)
passed the complete native check locally on macOS Apple Silicon with Rust
1.99.1, matching the toolchain used by the native CI run. This covers the changes
since `native-v0.16.0-preview.9`.

All jobs in the [native preview workflow](https://github.com/hardbeat920/monocode/actions/runs/40900397284)
and [main CI workflow](https://github.com/hardbeat920/monocode/actions/runs/40900397314)
also passed for this commit. Native Core checks passed on macOS, Linux and
Windows; the native desktop formatting, Clippy, tests and build passed on macOS.

| Check | Result |
| --- | --- |
| Native script tests | 29 passed |
| Native workspace formatting | Passed |
| Strict Clippy for core and GPUI, all targets | Passed |
| Native core tests | 640 passed, 2 ignored |
| GPUI tests, run serially | 747 passed, 11 ignored |
| Native macOS build, `native-dev` profile | Passed |

The final checks used:

```sh
RUSTUP_TOOLCHAIN=1.99.1 npm run native:check
cargo +1.99.1 build --manifest-path crates/molfar-gpui/Cargo.toml --locked -p molfar-gpui --profile native-dev
```

Local fixtures required permission to open loopback sockets and inspect
processes.

These results cover automated fixtures and a local development-profile build.
Preview 10 installers, signing/notarization, packaged upgrades, live heartbeat
and background delegation behavior, and live Hermes reasoning-effort behavior
have not been validated by these checks. Linux and Windows runtime coverage
remains as recorded above and in [preview limitations](parity.md).

### Review fixes

The pre-release review fixes retain a Familiar's selected permissions for heartbeat
runs, exclude read-only GitHub review lookups from contribution counts, and
resolve commit IDs and line counts in the command's checkout. Regression cases
cover all five permission modes, submitted versus pending reviews, quoted and
repeated `git -C` options, explicit tool working directories and commits batched
across multiple checkouts. The permission fixture also exposed and now covers
a crash when rendering the Familiar's usage-limit notice.

Local revalidation with Rust 1.99.1 passed 29 native script tests, 644 core tests
(2 ignored), and 748 GPUI tests (11 ignored). Native workspace formatting,
strict Clippy for core and GPUI across all targets, and the macOS `native-dev`
build passed.
The linked CI runs above cover the `bc8c73da` baseline; these additional review
fixes were checked locally.

The first candidate CI run exposed a timing race in the existing split-pane
animation test: keyboard simulation could finish the animation before the test
froze its elapsed time. The fixture now creates and freezes the split in one
update, retaining its mid-slide and settled-layout assertions. Keyboard split
behavior remains covered by the separate split-and-drag interaction test.

## Preview 11 candidate — October 30, 2026

The release-review fixes based on `dbec0c5f` passed locally on macOS Apple
Silicon with Rust 1.97.1. Branch naming now uses only the selected provider
and account. The ink canvas leases its animation clock after painting has
initialized its state, and releases it when quiet. Legacy empty-session
choices survive both isolated workspace restoration and desktop preference
reconciliation. Changes to the desktop toggle during an upgrade still apply.

Native dependencies were updated to Tokio 1.54.1, rustls-webpki 0.103.16,
webpki-roots 1.0.11, p256 0.14.0 / crypto-bigint 0.7.10, zstd 0.14.3 /
zstd-safe 8.2.0, and pulldown-cmark 0.13.6. The production lockfile was also
updated for the shared mobile-link requirements and TLS patches.

| Check | Result |
| --- | --- |
| Complete native check, including formatting and strict Clippy for all targets | Passed |
| Native script tests | 29 passed |
| Native core tests | 650 passed, 2 ignored |
| GPUI tests, run serially | 761 passed, 11 ignored |
| Shared phone-link tests in the native workspace | 25 passed |
| Shared phone-link tests in the production workspace | 25 passed |
| Native macOS executable build, `native-dev` profile | Passed |
| Native RustSec vulnerability matches | 0; no advisory IDs ignored |
| Long-history CPU benchmark | Passed for preview 10 and this candidate |

Regression coverage includes unsupported/unavailable branch-name providers,
preserving the selected account, first-paint animation startup, settling to
sleep, waking by pointer interaction, reduced motion, and preference
migration with explicit new choices and subsequent desktop edits. A synthetic
identity and enrollment proof generated with p256 0.13.2 verifies that the new
signing library imports the same saved key, preserves its certificate
fingerprint, verifies the old proof, and produces the same proof bytes. The
fixture is public test data, not a real paired device's credentials.

The RustSec database was refreshed to
`2295466c4e9df26647fd67d8fa1c705ac2fc7f81` before the final scan. Eleven
unmaintained-package entries and one informational Rand logger-soundness
warning remain. Rand 0.7.3 comes through the legacy LevelDB reader; its `log`
feature, required to trigger that advisory, is absent from the resolved
all-platform core feature graph. These warnings were not suppressed. This
native result does not clear the separate React/Tauri and npm dependency
graphs: the production Rust lockfile still has seven vulnerability matches
in zip/zstd dependencies, and the npm findings from the review are unchanged.

### Long-history CPU comparison

The ignored `pane_motion_frame_cost_with_long_history` fixture now freezes the
requested animation position. It continues to require one shell render per
sample, allowing a second only when the slide installs its settled layout.
That settling work remains in the measured time; slow samples are not dropped.

An isolated tracked-source copy of preview 10 used the identical measurement
fix, unchanged vendored dependencies, the same compiler, and the same
`native-dev` profile. After one warm-up per revision, three alternating runs
were measured with no compiler jobs active. Each run sampled 80 positions in
a conversation with 10,000 messages and checked that fewer than 100 visible
rows were rendered.

| CPU measurement | Preview 10 | Candidate |
| --- | --- | --- |
| Median of run p50 values | 12.27 ms | 11.87 ms |
| Median of run p95 values | 13.20 ms | 12.72 ms |
| Range of run p95 values | 12.41–13.28 ms | 12.56–13.65 ms |

The overlapping ranges show no material regression in this benchmark; they do
not establish a speedup. These are CPU measurements at simulated 120 Hz
animation positions, not evidence of 120 fps presentation. GPU costs, live
provider contention, canvas power use in a real window, and packaged upgrades
still need runtime checks. The executable was built without launching it or
opening the installed database. Cross-platform CI and signed installers remain
release-pipeline checks.

## Local checks

Run the complete native check from the repository root:

```sh
npm run native:check
```

Core tests run in parallel. GPUI tests run serially to isolate rendering state
and avoid CPU contention with the interpreter's wall-clock limits.

For focused work, run the relevant part:

```sh
npm run native:test:dev
cargo fmt --manifest-path crates/molfar-gpui/Cargo.toml --all --check
cargo clippy --manifest-path crates/molfar-gpui/Cargo.toml --locked -p molfar-core -p molfar-gpui --all-targets --profile native-dev -- -D warnings
npm run native:test
```

On macOS with a Metal device, the renderer regression opens no window:

```sh
cargo test --manifest-path crates/molfar-gpui/Cargo.toml --locked -p molfar-gpui --profile native-dev overlapping_shell_pane -- --ignored
```

## Optional runtime checks

The provider smoke example uses an existing CLI login. `--models` only discovers
the catalog; without it, the example makes two real provider requests and checks
streaming and resumed context:

```sh
cargo run --manifest-path crates/molfar-gpui/Cargo.toml --locked -p molfar-core --profile native-dev --example provider_smoke -- cursor --models
cargo run --manifest-path crates/molfar-gpui/Cargo.toml --locked -p molfar-core --profile native-dev --example provider_smoke -- cursor
```

For long-history interaction, use the isolated fixture from the
[native guide](README.md#checks-and-fixtures). Check typing and scrolling while a
separate real session streams, then switch tabs and verify draft/viewport state,
Stop, and saved history after relaunch. Synthetic history is not sent to providers.

## MOLFAR Board first Grill round — November 1, 2026

Native tests passed: 677 core, 747 GPUI and 31 native script tests, with strict
Clippy and formatting of the native crates. Two core and eleven GPUI manual or
platform tests remain ignored. Another 79 upstream, release and branding tests
passed, along with branding, rename routing and diff checks. `npm run native:build`
produced an optimized, locally signed macOS app without launching it.

Synthetic fixtures drive a fake provider through the real native turn path:
settlement after the Board closes, artifact-save failure and retry, cancellation
before install and at prompt acceptance, restart without replay, a deleted
session after restart, read-only checkout fingerprints and Board ownership
guards. An independent review's findings were fixed and re-reviewed. No actual
app, browser, device, live provider or production data was used.

## MOLFAR Board stage policy — November 1, 2026

Native tests passed: 701 core, 754 GPUI and 31 native script tests, with strict
Clippy and formatting of the native crates; two core and eleven GPUI manual or
platform tests remain ignored. 79 upstream, release and branding tests passed,
and `npm run native:build` produced an optimized, locally signed macOS app that
was not launched. Fixtures cover the full shipped transition table, per-stage
model and skill precedence, settings that the desktop Board can still read,
Retry overrides, Back, frozen run provenance and the native Stage settings
dialog, including real keystrokes. Two independent review rounds were addressed.
No actual app, browser, device, live provider or production data was used.

## MOLFAR Board owner review and repeated Grill — November 2, 2026

M01a implementation: `eab8b0bbe4ec1eb8beddf1a05e94b1b5ccc415f0` (base `018c78e9`).
The checked source was committed unchanged after verification. Its source
fingerprint is `cfa186221d00cd1aaf5cc57b6a03e4cbaf2ac9a52951398ed94ce17298e6b867`.
The results below are local checks, not remote CI or runtime certification.

| Check | Result and scope |
| --- | --- |
| `npm run native:check` | Exit 0; 31 Node tests, native formatting and strict all-target Clippy, 763 core passed / 2 ignored, 835 GPUI passed / 11 ignored, 6 wheel regressions passed |
| `npm run check:web` | Exit 0; 7,145 passed / 13 skipped, TypeScript, lint, size, boundaries, moves and branding; no web/Tauri source changes followed this run |
| Final structural checks | Size, boundaries, moves, branding and diff checks passed after the final test paths were added |
| `npm run native:build` | Exit 0; optimized macOS app built and locally signed without launch; `codesign --verify --deep --strict` exit 0 (release compilation 14m 38s) |

Core fixtures cover current-run questions, desktop answer formatting, versioned
plan edits, stale/concurrent/read-only actions, filesystem limits and immutable
artifact recovery after partial saves. Native synthetic fixtures cover draft
preservation, conflict reload, focus, keyboard, IME and reduced motion. A fake
provider drives two native Grill rounds through separate sessions with versioned
handoff files; earlier plan versions and the original checkout are retained.
Restart cases cover accepted/prepared round 2 and durable submitted receipts.

The first-round prompt fixture remains exact; a second fixture pins the complete
later-round prompt. Both use LF checkout attributes. A new accepted-state test
initially timed out because test mode disables automatic polling; explicit poll,
as in the existing prepared-state fixture, produced red/green without a
production-code change. The complete native gate was then rerun successfully.
Independent source review findings were addressed and rechecked.

These checks use temporary databases/projects and test contexts. No actual
application, browser, device or live provider QA, production-data writes, job
activation, publishing or merge occurred. The thirteen ignored native tests
remain manual/platform checks. Approval-to-Implement and subsequent execution
and delivery remain pending; M01a does not close full Board or GPUI parity.

## Migration branch reconciliation — November 2, 2026

The main checkout on `migration/gpui-into-main` fast-forward integrated M01a
`eab8b0bb` / `6b08aa29`, then reconciled main through `5ee67cce` (v1.0.23).
The only merge conflict was CHANGELOG.md; both connector Unreleased content
and the released v1.0.23 notes are retained. All 41 M01a source/fixture/attribute
files remain byte-identical to `6b08aa29`. Imported Familiar source and tests
match `5ee67cce` exactly. See [working location and status](status.md).

Fresh local checks for this reconciliation:

| Check | Result |
| --- | --- |
| `npm run check:web` | Exit 0; 7,145 passed / 13 skipped, both TypeScript checks, lint, size, boundaries, moves and branding |
| Release changelog/version/open-PR tests via project Vitest | Exit 0; 31 passed |
| `cargo test --locked -p molfar --lib codex_familiar_store::tests -- --test-threads=1` | Exit 0; 7 passed, 749 filtered |
| Source preservation, current documentation links and status JSON | Passed; secondary tracked worktree remains clean |

The initial release test invocation used Node's test runner on Vitest files
and failed; the corrected Vitest run above passed. No source change was made
for that invocation error.

Full native/Tauri suites, optimized native build, dependency/security audit,
application/provider/device QA and current remote CI were not rerun for this
reconciliation. Prior native gate/build evidence remains pinned to M01a.
The reconciliation is local until published; it does not change the remote PR
status, installed automation or production application.

## MOLFAR Board execution (readiness M02) — November 2, 2026

Commits `ff780975` (stage contracts), `16233522` (lifecycle and native
coordinator), `bf984b8f` (native controls) and `2369ba98` (review fixes and
coverage), base `f98187b8`. The checks below ran on `2369ba98` unchanged. They
are local checks, not remote CI or runtime certification.

| Check | Result and scope |
| --- | --- |
| `npm run native:check` | Exit 0; 31 Node tests, native formatting and strict all-target Clippy, 777 core passed / 2 ignored, 847 GPUI passed / 11 ignored, 6 wheel regressions passed |
| `npm run check:web` | Exit 0; 7,145 passed / 13 skipped, TypeScript, lint, size, boundaries, moves and branding; no web/Tauri source changes |
| `npm run native:build` | Exit 0; optimized macOS app built and locally signed without launch; `codesign --verify --deep --strict` exit 0 (release compilation 6m 59s) |

Core fixtures cover the full approval → Implement → Code review → Final review →
Rework → Code review chain with per-stage attempts and immutable review versions,
exact desktop prompts and output contracts, stale/duplicate/archived actions,
per-stage Retry overrides, models frozen at acceptance, prior-cycle review
receipts, oversized and forged output, partial artifact saves, writing-stage
commit/clean policy, read-only review mutation and the Back-to-Final-review
guard. A fake provider drives the native pipeline in a temporary retained
checkout, including dirty starts with no provider submission, failed writing
stages that keep their changes, and accepted/prepared/submitted restarts without
replay. Native synthetic fixtures cover legal actions, single-emit approval,
finding preselection, focus order, keyboard selection and draft preservation
after failed submit and conflict.

The first full gate run hit one failure in the unchanged
`checkpoint::tests::commits_after_the_turn_clear_modified_created_and_deleted_files`
(`git commit` in a temporary repository returned an empty error under parallel
load with global hooks). It passed three isolated reruns and the complete rerun
recorded above. An independent source review found no blocking or major defects;
its minor findings were fixed or recorded. Writing stages compare HEAD equality
only, matching desktop; ancestry and branch checks are possible hardening.

No actual application, browser, device or live provider QA, production-data
writes, job activation, push or merge occurred. Delivery and archive actions
remain pending; M02 does not close full Board or GPUI parity.
