# Native verification

Status recorded on October 22, 2026, on macOS Apple Silicon. These are local
results, not a release certification. Later dated sections supplement this
snapshot. See [preview limitations](parity.md) for
remaining runtime and platform work.

## Merged head and review fixes: November 5, 2026

Scope: `0eaa7ea0` on local `sync/gpui-20261105`, on top of merge `2e72e27e`. That
merge combines the Companion and release preparation with upstream sync commit
`1cbf81da` (`main` through `a25b5b89`). The red Windows and macOS Clippy jobs on
PR head `1cbf81da` are the `Sampler` and sphere errors already fixed by
`b9b768c4`. This revision was not published when these results were recorded,
so no hosted CI covers it yet.

An independent review of the merged range found these defects, all fixed in
`0eaa7ea0`:

- `libc::gethostname` is absent from libc on Windows, so the native app could
  not build there. Existing Windows CI builds only `molfar-core`. The gateway now
  uses a shared core helper based on the `hostname` crate.
- A device revoked by the desktop app kept authenticating on Native, and Native's
  next write restored it. Native now reloads the shared file when it changes.
  There is no cross-process lock, so simultaneous writes can still lose one update.
- tiny_http drains unread bodies when a request drops, without socket timeouts.
  Eight stalled clients could pin every worker, even after a 413 or 401. Streamed
  requests now get their reply off the worker pool and `/v1/pair` refuses them.
  A paired device can still pin a worker with a stalled RPC body.
- Failed pairing and revoke actions were silent, and stale offers stayed visible.
- The phone overview showed `supervised` and no model for unloaded sessions.
- A failed AppImage tool download could fall through to an unverified tool on PATH.

| Evidence | Current result |
| --- | --- |
| `npm run native:check` | Exit 0; 43 Node tests, format and strict Clippy passed; core 832 passed / 2 ignored, GPUI 1,039 passed / 11 ignored, wheel 6 passed |
| `npm run check:rust` | Exit 0 before a test-only Clippy cleanup covered by `native:check` |
| `npm run check:size`, `check:boundaries`, `check:moves`, `check:native-branding` | Exit 0 |
| `npm run check:web` | Exit 0 on `2e72e27e`; 7,159 tests passed / 13 skipped. No web source changed afterwards |
| Mobile lint, `tsc`, Vitest | Exit 0 on `2e72e27e`; 187 tests passed. No mobile source changed afterwards |
| Stalled-client regression | Fails with `WouldBlock` when the off-pool reply is removed; passes with the fix |
| `actionlint` | Not run; not installed in this session. The edited workflow parses as YAML |

Windows and Linux Native builds and packages, Intel builds, public signing,
environment protections and runtime acceptance remain unverified. The Windows
fix is checked only against libc sources; no Windows build ran locally. Discovery
still spawns the Tailscale CLI every 30 seconds while Companion is off.

## Merge and release preparation: November 5, 2026

Scope: local changes after `8840e63c`, with the retained Companion commit.
The fetched integration tip was `61bb6048`; it is an ancestor, and no main
merge was needed. The owner assigned the six newer upstream commits after
`9ee7b3dd` to another session; this preparation does not port that range.

The lint fixes gate the Windows-inapplicable `Sampler` test import and pass
existing sphere bounds into the painter. No lint was disabled. The Native
Packages workflow adds four-architecture validation and manual GitHub native
prereleases; Tauri workflow/manifests/feed remain unchanged. Validation metadata
cannot enter public collection. Native updater endpoint/key remain unset.

| Evidence | Current result |
| --- | --- |
| Native script tests | Exit 0; 43 passed |
| Strict native Clippy | Exit 0 after the fixes |
| `npm run native:check` | Exit 0; 43 Node tests, format and strict Clippy passed; core 832 passed / 2 ignored, GPUI 1,029 passed / 11 ignored, wheel 6 passed |
| `npm run check:web` | Exit 0; 7,159 tests passed / 13 skipped; types, lint, size, boundaries, move map and native branding passed |
| Optimized Native build | Exit 0; `MOLFAR_NATIVE_VERSION=0.16.0-preview.1 cargo build --locked --manifest-path crates/molfar-gpui/Cargo.toml -p molfar-gpui --release` |
| Real macOS ARM64 validation packaging | Exit 0; app archive and DMG created, `codesign --verify --deep --strict` exit 0; plist identity `com.molfar.native`, version `0.16.0-preview.1`. No UI launch or installation. |
| Tauri release-tool tests | Exit 0; 31 passed |
| Workflow syntax | actionlint 1.7.12: exit 0 for both native workflows |
| Shell syntax | `bash -n`: exit 0 for signing, AppImage fetch and repack helpers |
| Independent source review | No blocking findings; publication guards and failure paths reviewed |
| Signing configuration read | Repository secret-name listing succeeded; all six required `APPLE_*` names absent. Environment secret listing for `native-release` returned HTTP 404. No values were read and no configuration changed. |

The initial native sandbox run failed 15 socket/process fixtures with
`Operation not permitted`; it is not counted as a pass. The permitted complete
rerun passed and is the acceptance gate. The first complete web run reached all tests but
failed a new regex lint; the assertion now expresses the required two checksum
separator spaces as `{2}`, without suppressing lint, and the full gate rerun passed.

License notices are unchanged in this preparation; no new dependencies were introduced.
Cargo reports the existing `block v0.1.6` future-compatibility warning.

Hosted Windows/Linux/Intel packages, public signing/notarization, installed
environment protections, package upgrades and live phone/provider/data
acceptance remain unverified. No app/browser launch, real user-data access,
workflow dispatch, release publication or PR merge is included. The canonical
sync instructions were edited; installed automation state was not changed.

## Companion checkpoint: November 5, 2026

Implementation revision: `8840e63c` on local `sync/gpui-20261105`. This includes
Companion and its fixes; the commit has not been pushed. The sync checkpoint
records upstream `main` through `9ee7b3dd`. Results below come from the final
Companion run, before this documentation-only update. They do not certify a
release or current remote CI. Older dated sections retain their original scope.

| Command / review | Result |
| --- | --- |
| `npm run check:web` | Exit 0; 802 test files passed / 2 skipped; 7,159 tests passed / 13 skipped; web type/lint/structure checks passed |
| `cargo check --locked --manifest-path crates/molfar-gpui/Cargo.toml -p molfar-gpui --tests --profile native-dev` | Exit 0 |
| `cargo build --locked --manifest-path crates/molfar-gpui/Cargo.toml -p molfar-gpui --profile native-dev` | Exit 0; development binary build only |
| `npm run native:test` | Exit 0; core 832 passed / 2 ignored; GPUI 1,029 passed / 11 ignored; wheel 6 passed; 0 failed |
| Focused GPUI Companion tests | Exit 0; 17 passed |
| `npm run native:check` | Exit 101; Node tests 31 passed and format passed, then strict Clippy failed at `crates/molfar-gpui/src/home/visuals/sphere.rs:35`: `too_many_arguments` (8/7). The same error was reproduced on the pre-Companion baseline. Full Rust tests were run separately above. |
| `npm run check:native-branding` | Exit 0 |
| `node scripts/upstream/moves.mjs --check` after commit | Exit 0 |
| Staged secrets scanner and `git diff --cached --check` | Exit 0 |
| Independent source review | No remaining blocking findings in the final Companion changes |

The transcript regression first reproduced an empty result where ten blocks
were expected. The final tests cover native/shared history, stable IDs and
metadata overlays, Familiar ownership, launch choices, cancellation/rollback,
configuration retention, discovery isolation and listener restart requests.
All fixtures used isolated temporary or in-memory data.

No application/browser launch, real phone, live provider, real user data,
production packaging/signing, upgrade or fresh remote CI run formed part of
this acceptance. Runtime and release acceptance remain open. Coverage was not
measured in these runs. No installed automation configuration was changed.

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

## Upstream preview 13 reference — November 3, 2026

The following records upstream evidence. It does not establish MOLFAR verification or runtime parity.

Source revision `4550fded` passed the complete native check locally on macOS
Apple Silicon with Rust 1.97.1:

```sh
npm run native:check
```

- Native development, dependency-guard, packaging, and release script tests: 29 passed.
- Native workspace formatting: passed.
- Strict Clippy for core and GPUI, all targets, `native-dev` profile: passed.
- Native core tests: 666 passed, 2 ignored.
- GPUI tests, run serially: 829 passed, 11 ignored.
- Wheel-scroll integration tests: 3 passed.

The first preflight reproduced the latest macOS CI failure: the changes-shelf
fixture assigned `open` after constructing `ChangesShelf::default()`, triggering
`clippy::field_reassign_with_default`. Revision `4550fded` initializes that field
in the struct literal. This changes test setup only. The full successful check
above includes that correction.

The [candidate native workflow](https://github.com/hardbeat920/monocode/actions/runs/41643529160)
checks the same source with Rust 1.99.1. Its core checks passed on macOS, Linux,
and Windows, and the macOS desktop formatting and strict Clippy checks passed.

These local results cover automated fixtures. Signed installers, notarization,
package signatures, and update-feed publication are checked by the native
release workflow. No live-provider requests, companion device tests, or manual
packaged upgrade checks were performed in this preflight. Existing platform
runtime limitations remain as recorded above and in [preview limitations](parity.md).

## Preview 14 candidate — November 5, 2026

Source revision
[`da39885e`](https://github.com/hardbeat920/monocode/commit/da39885e5503a924647bd19b2a2376bc15eea0c0)
passed every native-check stage locally on macOS Apple Silicon with Rust 1.97.1
and Node 26.9.0:

- Native development, dependency-guard, packaging, and release script tests: 29 passed.
- Native workspace formatting: passed.
- Strict Clippy for core and GPUI, all targets, `native-dev` profile: passed.
- Native core tests: 671 passed, 2 ignored.
- GPUI tests, run serially: 843 passed, 11 ignored.
- Wheel-scroll integration tests: 3 passed.

The initial `npm run native:check` passed its script, formatting, and Clippy
stages, then encountered sandbox denials in core fixtures that open loopback
sockets or inspect processes. Rerunning the Rust stage with the required host
permissions completed successfully:

```sh
npm run native:test
```

The machine was also low on disk space during compilation. Removing the older
debug-profile incremental compiler cache made room for the test build; the
`native-dev` artifacts used for this check were retained.

The [candidate native workflow](https://github.com/hardbeat920/monocode/actions/runs/42036909502)
passed all jobs: core checks on macOS, Linux, and Windows, plus the macOS desktop
formatting, strict Clippy, tests, and build. The desktop job completed after the
local results above were first recorded.

The [preview 14 release workflow](https://github.com/hardbeat920/monocode/actions/runs/42040307219)
built all platform packages and passed macOS signing and notarization. Its native
client verifier checked the signed manifest and all six updater packages before
publication. [Preview 14](https://github.com/hardbeat920/monocode/releases/tag/native-v0.16.0-preview.14)
was published on November 5 at 14:34 UTC, with all 14 download and signature
assets uploaded. The public native update feed was checked afterward: it served
`0.16.0-preview.14`, its notes matched the release notes, and all six versioned
updater downloads returned HTTP 200. The GitHub release is marked as a prerelease;
the production channel is unchanged.

These results cover automated fixtures and publication checks. No live-provider
requests, performance benchmarks, companion device tests, or manual packaged
upgrade tests were performed in this preflight. Existing platform runtime
limitations remain as recorded above and in [preview limitations](parity.md).

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

## MOLFAR Board delivery (readiness M03) — November 3, 2026

Commits `4fe5dc0c` (delivery text and cleanup primitives), `9f344cf3` (Store and
service orchestration), `8aa75b57` (native runtime and controls) and `238aa1fe`
(review fixes), base `a2fb10c8`. Checks ran on `238aa1fe` unchanged; they are
local checks, not remote CI or runtime certification.

| Check | Result and scope |
| --- | --- |
| `npm run native:check` | Exit 0; 31 Node tests, native formatting and strict all-target Clippy, 806 core passed / 2 ignored, 854 GPUI passed / 11 ignored, 6 wheel regressions passed |
| `npm run check:web` | Exit 0; 7,145 passed / 13 skipped, TypeScript, lint, size, boundaries, moves and branding; no web/Tauri source changes |
| `npm run native:build` | Exit 0; optimized macOS app built and locally signed without launch; `codesign --verify --deep --strict` exit 0 (release compilation 5m 50s) |

Core fake-port fixtures cover pull request, squash-merge and keep delivery;
failure after push, PR and merge with resume (one PR, one merge); a crash after a
saved merge; PR adoption and externally merged PRs; GitHub unavailable; dirty or
missing worktrees after the lock; a worktree still in use; finishing after an
earlier cleanup; concurrent start and stale progress; reject from each state with
worktree and branch failure notes; Done archive keeping its branch; base-ref
fallback; and stage reconcile leaving delivering cards alone. Real temporary
repositories cover non-force removal keeping dirty trees, forced reject removal,
and task-branch rules for pushed, attached and foreign branches. Native runtime
fixtures drive the fake provider to Final review, then keep-branch delivery with
session detach, an unreachable GitHub failure followed by reject, and startup
reconcile. Synthetic UI fixtures cover the method picker, Keep-only without
GitHub, merge and reject confirmation, single emission, Done archive and hidden
actions while delivering.

An independent source review found no blocking defects; its two major findings
were fixed: a busy worktree no longer fails a published delivery, and existing
PR lookup no longer passes `owner:branch` to `gh pr list --head`, which current
gh rejects. The same lookup in the desktop Tauri app is unchanged. A first full
gate run failed 19 unrelated GPUI layout tests because startup reconcile surfaced
an error for native-only test stores; native-only stores now report no stuck
deliveries, with a regression test, and the full gate passed.

No actual application, browser, device or live provider QA, real push, pull
request or merge, production-data writes, job activation or publishing occurred.
Task editing and reordering remain open; M03 does not close full Board or GPUI
parity.

## MOLFAR Board task editing and moves (readiness M08a) — November 3, 2026

Commits `f0899eb6` (core EditTask and legal moves), `c4e96309` (native editor and
Move to…) and `db9ac988` (review fixes), base `4b900cd4`. Checks ran on
`db9ac988` unchanged; they are local checks, not remote CI or runtime
certification.

| Check | Result and scope |
| --- | --- |
| `npm run native:check` | Exit 0; 31 Node tests, native formatting and strict all-target Clippy, 810 core passed / 2 ignored, 861 GPUI passed / 11 ignored, 6 wheel regressions passed |
| `npm run check:web` | Exit 0; 7,145 passed / 13 skipped; no web/Tauri source changes |
| `npm run native:build` | Exit 0; optimized macOS app built and locally signed without launch; `codesign --verify --deep --strict` exit 0 (release compilation 5m 47s) |

Core fixtures cover Backlog and Plan approval edits, trimming and required
fields, the Backlog-only base branch and its reset, new task versions with prior
versions retained, the newest task reaching the Implement handoff, and refusals
for stale, invalid, running and archived cards without writes. A table test pins
legal moves to the desktop drop targets. Synthetic UI fixtures cover the
prefilled editor, single submission, base lock, draft preservation on conflict,
focus return after save, background results not completing a busy edit, hidden
editing outside legal states, immediate moves, input moves opening their panels
and Back following the readable-review guard.

An independent source review found no blocking defects. Its two major findings
were fixed: background delivery completions could complete or unlock a busy
edit, and focus was not returned after a successful save. Kanban columns and
drag-and-drop remain for M08b. No actual application, browser, device or live
provider QA occurred.

## MOLFAR Board kanban and drag (readiness M08b) — November 3, 2026

Commits `e8b98c67` (kanban columns and detail drawer), `9e1d66e8`
(drag-and-drop) and `1ae5270f` (review fixes), base `acd1d3f5`. Checks ran on
`1ae5270f` unchanged; they are local checks, not remote CI or runtime
certification.

| Check | Result and scope |
| --- | --- |
| `npm run native:check` | Exit 0; 31 Node tests, native formatting and strict all-target Clippy, 810 core passed / 2 ignored, 871 GPUI passed / 11 ignored, 6 wheel regressions passed |
| `npm run check:web` | Exit 0; 7,145 passed / 13 skipped; no web/Tauri source changes |
| `npm run native:build` | Exit 0; optimized macOS app built and locally signed without launch; `codesign --verify --deep --strict` exit 0 (release compilation 5m 17s) |

Synthetic fixtures cover all columns including newer unknown ones, the drawer
staying closed across fallback refreshes, Enter and Escape handling, the drawer
over cards, arrow navigation within and across columns, column model chips and
the picker, desktop status labels, dragging a card to start it, illegal drops,
input drops opening their panel, Escape cancelling a drag, edge-scroll speed and
Back for unselected failed reviews. Board test windows run with reduced motion so
animated layout is deterministic.

An independent source review found two blocking defects, both fixed: closing the
drawer was undone by the next refresh because the core falls back to the first
card, and the drawer did not occlude the columns beneath. Its major findings
(Back for unselected cards, edge scroll only while moving and outside the board,
refreshes moving the board scroll) were fixed. The drawer-occlusion test also
passed before `occlude` was added, so it is a regression check rather than proof
of the defect. No actual application, browser, device or live provider QA
occurred.


## Upstream integration sync — November 3, 2026

The isolated sync worktree integrates upstream `main` range `12552dc8..00c69307`
onto MOLFAR integration base `dc511ff3`, preserving the human migration ports.
All upstream desktop, mobile, native and shared code follows this one line;
MOLFAR `main` is unchanged. Installed automation configuration is unchanged.

- `npm ci`: exit 0. `npm run check:web`: exit 0, 7,158 tests passed and 13 skipped;
  the additional idle reset-watch regression passed separately with the existing
  hook tests (5 passed). The pre-push hook reruns the complete committed tree.
- Mobile locked install, full Vitest suite and `tsc --noEmit`: exit 0;
  184 tests passed across 33 files, including hide and reselect coverage.
- `npm run native:check`: exit 0 after resuming an interrupted run;
  31 Node tests, 823 core tests (2 ignored), 913 GPUI tests (11 ignored)
  and 6 wheel integration tests passed. Formatting and strict Clippy passed.
- `cargo check --quiet` in `src-tauri`: exit 0. This is compile evidence;
  the Tauri Rust test suite was not run separately.
- Branding, move-map, staged secret and whitespace checks passed.
  License notices are unchanged; no dependencies or publishing workflows changed.

The first native attempt failed on duplicate Familiar event exports; those were
removed without dropping either event. A later run was interrupted before GPUI
completion; the resumed complete gate above supplies the native result.
No app, live provider, real user database, browser QA, mobile native build or
platform runtime acceptance was used. These results do not close migration parity.

## CI and migration-documentation reconciliation — November 3, 2026

Follow-up to upstream integration `8ef99c49`. Its remote run
[41720371669](https://github.com/deluminor/molfar/actions/runs/41720371669)
passed Windows production checks, both native macOS jobs, all six native core
matrix jobs and the other reported jobs, but failed three production jobs:

- Mobile ESLint rejected synchronous `setGone` in a roster effect. Reproduced
  locally with exit 1. Guarded render reconciliation now updates `{ roster, ids }`
  atomically, keeping optimistic hiding until the authoritative roster removes
  the ID. The regression covers unchanged roster copies, removal and reselect.
- macOS/Linux Tauri `cargo clippy --workspace --all-targets -- -D warnings`
  rejected `link_entry` imported under `cfg(test)` while all callers are
  Windows-only. Reproduced locally with exit 101. The import now uses
  `cfg(all(test, windows))`; the Windows test callers remain unchanged.

Repair verification:

| Command | Result |
| --- | --- |
| Root `cargo clippy --workspace --all-targets -- -D warnings` | Exit 0 |
| Root `cargo test --lib codex_familiar_store::tests -- --test-threads=1` | Exit 0; 10 passed |
| Mobile `npm run lint` | Exit 0; two existing dictation warnings remain, no errors |
| Mobile full Vitest suite | Exit 0; 184 passed in 33 files |
| Mobile `tsc --noEmit` | Exit 0 |

The pre-push web hook checks the complete committed follow-up. Native runtime
code is unchanged by these two CI fixes; the full native gate above remains
explicitly scoped to `8ef99c49`, not a newly claimed native run. The final remote
CI must be read at the actual follow-up head; earlier green native jobs do not
turn the failed production jobs green. No app/browser/device/provider QA or
real-user-data checks were added.

The tracked [feature transfer register](feature-transfer.md), status, limitations,
architecture and canonical automation checks are aligned with this evidence.
Jira/Confluence, Home/Usage, Knowledge and remaining runtime acceptance are open;
review readiness does not close them. Installed automation settings are unchanged.

## Native Board presentation and interaction checks — November 4, 2026

Scope: Board polish `32aeae48` over `9e9974fd`; the code tree tested below
is unchanged in that commit. Publication was authorized separately afterward;
no merge, release or cutover is included.
Board controls now share compact styling, detached drag previews have explicit
foreground/background, and the drawer uses an opaque theme surface with slide-only
entry. Edit stays in its header behind the existing eligibility/metadata guards;
stage actions have a separate bounded footer. Description and criteria reuse
native Markdown previews prepared off the UI thread, with independent measured
240px folds (content through 304px stays whole). Preview generations and entity
identity reject stale completions, including A → B → A selection races.
Settings use grouped stage controls, a bounded scrolling body, fixed header/footer
and shrinking model labels with full-value tooltips. Existing save semantics stay.

| Check | Result |
| --- | --- |
| `npm run native:check` | Exit 0; 31 Node tests, formatting, strict all-target Clippy; 823 core passed / 2 ignored, 918 GPUI passed / 11 ignored, 6 wheel tests passed |
| `npm run native:build` | Exit 0; optimized macOS bundle, compilation 4m 41s |
| `codesign --verify --deep --strict` | Exit 0 |
| Diff/changed-line checks | Whitespace and targeted secret/debug/dead-code review completed; no new dependencies |
| Independent source review | No remaining blocking findings after stale-preview and long-model-label fixes |
| Actual native UI QA | BLOCKED: Computer Use returned `Computer Use was not approved to use MOLFAR Native`; no successful screenshots or interactions |
| Web gate | Not rerun: native-only presentation/interaction change; no web/Tauri changes |

New synthetic GPUI checks cover short/long Markdown, independent disclosure,
keyboard expansion/collapse, refresh preservation/card-switch reset, stale preview
rejection, visible header Edit/footer actions, pending metadata guards and settings
shortcut isolation. Existing Board tests cover create/edit/conflict, legal and
illegal drag/drop, stage gates, single submission, review and delivery controls.
These tests do not establish real provider or remote delivery acceptance.

The first sandbox gate stopped on 15 local fixture socket/process permission
failures; the complete gate passed with the required local fixture access.
A new keyboard test initially had a Rust borrow error; after correction the full
gate above passed. The isolated app used only `/tmp/molfar-board-polish-qa`, with
a synthetic Backlog card, and was terminated after UI access was refused. No
production-data, live-provider, push/PR/merge or installed-app changes were made.
Runtime visual quality, narrow-window/light-theme interaction and real workflow
acceptance remain open. The existing dependency warning for `block v0.1.6` remains.

## Native Board desktop presentation — November 4, 2026

Scope: uncommitted desktop-presentation follow-up over `d5a77e52` (detail panel
reserves width, visible horizontal Board scrollbar, Overview/artifact tabs,
compact metadata, stage timeline, workspace project filter, anchored column
settings, 28px header controls).

| Check | Result |
| --- | --- |
| `npm run native:check` | Exit 0; 31 Node tests, formatting, strict all-target Clippy; 823 core passed / 2 ignored, 930 GPUI passed / 11 ignored, 6 wheel tests passed |
| `npm run native:build` | Exit 0; optimized macOS bundle, compilation 6m 14s |
| `codesign --verify --deep --strict` | Exit 0 |
| Diff checks | No debug output, untracked TODOs or new dependencies; `popover.rs` (+6) and `shell/app_views.rs` (+1) are pre-existing oversized files |
| Actual native UI QA | BLOCKED: Computer Use was not approved for MOLFAR Native; no screenshot comparison or real-window interaction |

The first full gate failed one test, `sidebar_hover_updates_labels_without_rebuilding_the_chat`,
because `d5a77e52` placed Board above Notes. The expectation now names Board for
the row below Inbox; the full gate above passed afterward. The existing
`block v0.1.6` future-incompatibility warning remains.

## Native Home — November 4, 2026

Scope: Home grid `1954e48d` plus the widget follow-up committed with this entry.

| Check | Result |
| --- | --- |
| `npm run native:check` | Exit 0; 31 Node tests, formatting, strict all-target Clippy; 825 core passed / 2 ignored, 973 GPUI passed / 11 ignored, 6 wheel tests passed |
| `npm run native:build` | Exit 0; optimized macOS bundle, compilation 3m 41s |
| `codesign --verify --deep --strict` | Exit 0 |
| Actual native UI QA | BLOCKED: Computer Use is not approved for MOLFAR Native; no screenshots or real-window interaction |

Two earlier full runs failed `conversation::menu_tests::recent_models_open_on_right_click_and_pick_by_keyboard`
(`GPT-6-luna` instead of `GPT-6-Luna`). Root cause: the new Automations open test selected
an automation, whose editor fetched the real Codex catalog into the process-wide catalog
cache. The editor now skips provider catalog fetches under test, matching the model
picker; the full gate above passed afterward.

Synthetic GPUI checks cover navigation order, grid placement, narrow stacking, hide/show/Reset
persistence, drag with push-down, resize minimums, Escape order, widget rows and open events,
failed loads, Brand selection, Activity days, hidden Host not sampling and visibility-gated
polling. Host sampling is checked against the real macOS host. Usage reads the shared accounts
cache; real provider usage and Inbox connectors were not exercised.

## Native Home polish — November 4, 2026

Scope: adaptive Clock and Status, Sphere-only Brand, smooth Matrix, four Host
charts with timestamped 30-minute retention, and responsive Activity context.
Orb/Fire rendering and selector are removed; legacy preferences normalize to
Sphere while preserving owner geometry. Default Host is taller; custom layouts
are retained.

| Check | Result |
| --- | --- |
| `npm run native:check` | Exit 0; 31 Node tests, format, strict all-target Clippy; 825 core passed / 2 ignored, 986 GPUI passed / 11 ignored, 6 wheel tests passed. All 50 Home tests passed. Local log: `/private/tmp/molfar-home-polish-verified.log` |
| `npm run native:build` | Exit 0; optimized macOS app, release compilation 6m 58s |
| `codesign --verify --deep --strict` | Exit 0 for release `MOLFAR Native.app` |
| Independent review | No remaining blockers after fixes |
| Diff/source scan | `git diff --check` exit 0; changed/new Home source scan found no secrets, debug output or untracked TODOs; no new dependencies |
| Coverage | Not collected; no configured coverage command invoked |
| Actual native UI QA | Unverified: previous Computer Use access for MOLFAR Native was denied; no native screenshots, real-window interaction or runtime performance measurement |

Review fixes preserve compact Status metrics, show Host stale state at minimum
height, use the shared pulse for recurring animation, bound Matrix trail alpha,
repeat the time axis within each Host chart, and invalidate CPU baselines on
Home/Host visibility changes. Host charts scroll using real time without
interpolating measured spikes; paused sampling appears as gaps. Activity counts
use latest session-update dates, not a complete historical event stream.

An initial sandboxed core run failed process-management access with
`Operation not permitted`; the permitted rerun passed core tests. Intermediate
GPUI runs found legacy test expectations for `fire` and the old grid height;
those expectations now reflect Sphere migration and the taller default Host.
The existing `block v0.1.6` future-incompatibility warning remains.
