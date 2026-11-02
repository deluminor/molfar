# Automation prompt — Sync MonoCode upstream (main + GPUI)

Updated November 2, 2026. Canonical prompt for the combined MOLFAR upstream
sync. It replaces the separate desktop and GPUI prompts. The only active upstream
source is `upstream/main`; MOLFAR's two state files remain independent until the
migration PR merges.

Copy the prompt below into the existing combined automation when updating its
configuration. This document does not change the installed prompt, model,
schedule or enabled state. Those settings were not inspected or changed here.
Do not run legacy separate jobs alongside the combined job against the same refs.
Retiring or reconfiguring installed jobs requires an explicit operator action.

PR #127 was made ready for review by the user on November 2. Future sync runs
preserve that decision. Review status does not control Phase 1/2 detection.

---

You are running the weekly MonoCode upstream sync for MOLFAR (`deluminor/molfar`), a standalone repository derived from MonoCode (`hardbeat920/monocode`). This one automation keeps **both** MOLFAR lines current with MonoCode, and pulls in **all** upstream code: every upstream change arrives, adapted to MOLFAR's names, structure, branding and license notices. Nothing upstream is silently dropped; nothing MOLFAR-specific is lost.

Follow `~/.agents/AGENTS.md` and the repository `AGENTS.md`. Use `d-investigate` for failures and `d-verify` before any pass claim.

## Upstream layout (as of 2026-11)
- `upstream/main` is MonoCode's only active branch. It contains the React/Tauri app (`src/`, `src-tauri/`, `host/`, `mobile/`) **and** the native GPUI app (`crates/monocode-core`, `crates/monocode-gpui`, `vendor/gpui-pre*`, `docs/native/`, `scripts/*native*`, `scripts/native-editor/`, `scripts/native-settings/`). `upstream/mc/migrate-monocode-to-gpui` was merged into it and is dormant. Call `upstream/main` **the source** below.
- "Native paths" means: `crates/monocode-*` / `crates/molfar-*` except `crates/mobile-link`, `vendor/gpui-pre*`, `docs/native/`, `scripts/*native*`, `scripts/native-editor/`, `scripts/native-settings/`, `scripts/generate-material-icons.mjs`, `scripts/generate-hugeicons.mjs`, `.github/workflows/native*.yml`, and the `native:*` scripts in `package.json`. Everything else is "desktop paths".

## Phase detection (do this first)
```bash
gh pr view 127 -R deluminor/molfar --json state,isDraft,headRefName,mergedAt
git fetch origin main
git fetch upstream main
if git cat-file -e origin/main:crates/molfar-gpui/Cargo.toml 2>/dev/null; then echo NATIVE_ON_MAIN; fi
```
- **Phase 1 — split sync** (PR #127 is `OPEN`): run **Part A** (desktop paths → `main` via a PR), then **Part B** (everything native, and desktop changes that ride along → `migration/gpui-into-main`, the head of PR #127). Fetch `origin migration/gpui-into-main` for this phase only; stop if that branch is missing or #127 has a different head branch.
- **Phase 2 — single sync** (PR #127 is `MERGED` and `crates/molfar-gpui` exists on `origin/main`): run **Part A only, with no native exclusion**. Native upstream changes go into `main` through the same PR, mapped to `crates/molfar-*`. Skip Part B entirely. In the final message, say once that the automation runs in Phase 2.
- PR #127 `CLOSED` without merge, or any other state: stop and report one line. A human decides.

Record `isDraft` before any Part B work and preserve it. OPEN is Phase 1 whether draft or ready.

## Branch model
- `origin/main`: MOLFAR's product branch. Protected; changes land only through PRs. Its `.github/upstream-sync.json` (`branch: main`) records the last upstream commit whose desktop changes are in `main`.
- `origin/migration/gpui-into-main`: MOLFAR's GPUI integration branch, head of PR #127. Not protected, fast-forward pushes only. A human also commits parity work to it. Its own `.github/upstream-sync.json` records the last upstream commit whose changes are in that branch. The two state files are independent; never copy one over the other.
- MOLFAR shares **no commits** with MonoCode. Upstream content arrives only as patches through `node scripts/upstream/apply.mjs <ref>`, which translates paths through `scripts/upstream/rename-map.mjs` (Monos → Familiars, `monocode_*` → `desktop_*`, crate names) and `.github/upstream-moves.json` (MOLFAR's moves, splits, extractions, removals).
- Native identity to preserve: crates `molfar-core` / `molfar-gpui`, binary `molfar-native`, app id `com.molfar.native` (`.dev` for development). Cargo manifests apply verbatim: fix crate names and path dependencies by hand after applying.

## Hard rules
1. Work only in `deluminor/molfar`. All `gh` commands pass `-R deluminor/molfar`. Never push, comment or open PRs/Issues in `hardbeat920/monocode`.
2. Never force-push. Never push to `main`. Push Part A sync branches for their PRs. The only existing integration target you push to directly is `migration/gpui-into-main`, and only as a fast-forward. Never push MonoCode refs to our repo.
3. Never `git merge`, `cherry-pick` or `rebase` MonoCode commits (anything reachable from `upstream/*`) into a MOLFAR branch, with or without `--allow-unrelated-histories`. It would put every MonoCode author back into MOLFAR's contributors, and CI rejects such branches. Merging `origin/main` into the GPUI branch is allowed: both are MOLFAR history.
4. Never bypass git hooks (`--no-verify`, `-c core.hooksPath=...`, hook-disabling env vars). If a hook fails, fix the cause.
5. Never commit conflict markers, `.upstream-pending/`, `docs/specs/`, scratch files or test fixtures.
6. No authorship or tool attribution anywhere you publish (commit messages, PR/Issue titles, bodies, comments): no `Co-authored-by`, `Generated by`, `Made with …`, AI/agent mentions, badges or footers. Technical descriptions of MOLFAR's agent features are fine.
7. Never drop functionality from either side to make a conflict go away. Losing a MOLFAR feature, a parity port on the GPUI branch, or an upstream change is a defect. "Pull everything in" is the default; a skip is allowed only where this prompt names it (MOLFAR-owned paths, publishing workflows, router port mapping, license blocks) and must be listed in the notes.
8. Preserve #127's human-selected draft/ready status; never change it, merge any PR or edit #127's parity checklist. Only the `Upstream sync` line of #127's body is yours.
9. Never import `.github/workflows/native-release.yml` or any upstream workflow that publishes, signs, uploads or reads `secrets.*`.
10. Do not launch the app, a browser or live providers, and never touch real user data (`com.molfar.desktop`). Never work in the user's main checkout; use this automation's own worktree.
11. If nothing is new for either part, exit silently: no commit, PR, comment or Issue.
12. Notes are written by you after reading the actual diff, in English, never a raw `git log` dump.

## Shared preconditions
- `gh auth status` works.
- `git remote get-url upstream || git remote add upstream https://github.com/hardbeat920/monocode.git`
- Git identity: `git config user.name` / `user.email` must be the owner (never `CRLF Test`, never `@example.invalid`), and `git config --get core.bare` must be `false`. Otherwise open `Sync blocked: repository git config corrupted (YYYY-MM-DD)` listing the bad keys and stop. Do not repair it and do not commit.
- `scripts/test/isolate-git-env.mjs` must exist in the tree you push. Without it the pre-push tests can rewrite this repository's config: stop before pushing and report it.

## Shared adaptation rules (apply in Part A and Part B, also on a clean patch)

In these rules, `$SYNCED` is the part's recorded commit (`$SYNCED_MAIN` in Part A, `$SYNCED_GPUI` in Part B), "the range" is `$SYNCED..upstream/main`, and "the base" is the part's target branch (`origin/main` in Part A, `origin/migration/gpui-into-main` in Part B). In Part A during Phase 1, native-only rules (native identity, native docs, `native.yml`) do not apply because native paths are excluded there.

### S1. MOLFAR-owned paths — keep MOLFAR's side
- Version numbers in `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock`, `crates/molfar-gpui/Cargo.lock`, `src-tauri/tauri.conf.json`: keep MOLFAR's versions and identity, but take MonoCode's other changes (new or bumped dependencies, new scripts, config). For lockfiles, run `git checkout --ours <lockfile>` and regenerate:
  - `npm install --package-lock-only --ignore-scripts` (root);
  - `cargo metadata --format-version 1 >/dev/null` (root workspace);
  - `cargo metadata --manifest-path crates/molfar-gpui/Cargo.toml --format-version 1 >/dev/null` (native workspace).

  Check that each lockfile diff touches only the changed dependencies.
- `CHANGELOG.md`: keep MOLFAR's history. Never take upstream's version sections or `hardbeat920/monocode` compare links. See A5 and B6 for `Unreleased` entries.
- `.github/workflows/`: keep MOLFAR's `release.yml` and `ci.yml`. For `native.yml`, take upstream's job and step changes, but keep MOLFAR's Phase 1 trigger (`push: branches: [migration/gpui-into-main]`); in Phase 2 target `main` instead and keep `native-release.yml` out of its `paths`. Never add `native-release.yml` or any new upstream workflow that publishes artifacts, signs, uploads, or reads `secrets.*`. List skipped workflows under **Breaking / attention**. If a workflow is CI-only (read-only permissions, no secrets), you may take it, and you must say so in the notes.
- `scripts/release/`, `src/app/model/fork-policy.ts`, `plugins.updater` in `src-tauri/tauri.conf.json`, `RELEASE_DOWNLOAD_BASE` in `src-tauri/src/remote_ssh.rs`, `src-tauri/src/remote_bootstrap.{sh,ps1}`.
- Host names in `host/` (`~/.molfar-host`, `molfar-host`, `com.molfar.host`, `MOLFAR Host-<SID>`, the `host.molfar` capability).
- Product name and branding (`MOLFAR` must not regress to `MonoCode` in the React app or in native user-facing text), `README.md`, `NOTICE`, `LICENSE`. Upstream README sections that promote MonoCode are not taken. Upstream native docs content goes into MOLFAR's README "MOLFAR Native preview" section or `docs/native/`, with MOLFAR naming.
- `mobile/assets/` artwork and the Expo account fields in `mobile/app.json` (`owner`, `extra.eas`, `updates`).
- **Router port mapping is opt-in only.**
  - Native app: UPnP/NAT-PMP (`crates/molfar-core/src/mobile/router.rs`, `igd-next`, `natpmp`) is allowed only behind the user's own **Open the router port automatically** toggle, and that toggle must be off by default. Keep `Config::default().open_router == false` and keep `router_port_mapping_stays_off_until_the_user_turns_it_on` in `crates/molfar-core/src/mobile/host.rs`. If an upstream hunk turns mapping on by default, maps ports without the toggle, or adds another automatic mapping path, drop that part and list it under **Breaking / attention**.
  - Tauri app: MOLFAR removed router mapping (`src-tauri/src/mobile_router.rs`, `open_router`/`router_*` in `src-tauri/src/mobile_access/`, crates `igd-next`/`natpmp`/`attohttpc`). Drop those hunks. `no_router_port_mapping_crates_are_built` in `src-tauri/src/mobile_access/tests.rs` guards it.
- MOLFAR's native adaptations that a sync must not undo:
  - native identity `com.molfar.native` (`.dev` for development), binary `molfar-native`, shared `com.molfar.desktop/molfar.db`, isolated native development data, and `.native.sqlite3` metadata;
  - desktop store APIs/flags (`desktop_database`, `open_desktop`, `--desktop-data`, `--desktop-db`) and an unconfigured native updater feed;
  - router mapping off by default (see above);
  - the direct `molfar-mobile-link` dependency in `crates/molfar-core/Cargo.toml`;
  - the `*b"MLFR"` Carbon hotkey signature;
  - kebab-case import paths in `scripts/native-editor/` and `scripts/native-settings/`;
  - the vitest exclusion of `scripts/*native*.test.mjs`;
  - native user-facing copy that mirrors MOLFAR's React strings;
  - every parity port a human has committed to the branch.

  Before resolving a conflict in a native file, read `git log --oneline origin/migration/gpui-into-main -- <path>` so you know which MOLFAR commits touched it.

### S2. License notices — always port upstream changes (mandatory, also on a clean patch)
MIT and Apache-2.0 require every copy to carry the notices, so an upstream notice change is never dropped.
- Check what upstream changed in this range:
  ```bash
  git diff "$SYNCED" upstream/main --stat -- LICENSE 'LICENSE*' NOTICE 'NOTICE*' '**/LICENSE*' '**/NOTICE*' '**/COPYING*' '**/*.LICENSE*'
  git diff "$SYNCED" upstream/main -U0 | grep -E '^\+.*(Copyright|SPDX-License-Identifier|Licensed under)'
  ```
- `LICENSE`: keep MOLFAR's text. Add every new or changed upstream copyright line next to the existing `Copyright (c) 2026 Nick` line.
- `NOTICE`: keep MOLFAR's text and append upstream additions in substance. That covers new GPUI or Zed snapshot notices, vendored crates, bundled assets (icons, themes, editor bundles) and modifications notes. Never drop an upstream native notice.
- License files under `vendor/**`, `docs/native/LICENSE-*`, `crates/molfar-gpui/assets/**`: take them exactly as upstream has them.
- New **source** under a license other than MIT or Apache-2.0, or a new dependency under GPL, LGPL or AGPL: stop and open `Sync blocked: license review needed (YYYY-MM-DD)` listing the files and licenses. New MPL-2.0, Apache-2.0 or other permissive dependencies are allowed; name them under **Breaking / attention**.
- If `scripts/package-native-support.mjs` (`notices`) or `scripts/package-native.mjs` lists notice files, keep that list in sync with any notice files upstream adds.
- Code copied from a third party into MOLFAR's own source (a file with someone else's copyright header, or one that says "derived from" / "adapted from") gets its full notice added verbatim to `NOTICE` under "Third-party code included in MOLFAR's own source", because minification strips source headers. New product names or logos shown in the UI go into the trademark paragraph of `NOTICE`.
- Never rename names inside a copyright line or license text during the branding scan.
- Keep the shipping of notices intact; do not remove any of these while resolving conflicts: `build.license` in `vite.config.ts` (`THIRD-PARTY-NOTICES.md`); `node scripts/licenses/rust-notices.mjs` in `beforeBuildCommand` of `src-tauri/tauri.conf.json` (`THIRD-PARTY-NOTICES-RUST.md`, with crates.io links for MPL-2.0 crates); `bundle.copyright` and the `LICENSE` / `NOTICE` entries in `bundle.resources`; the `MOLFAR-LICENSE` / `MOLFAR-NOTICE` / `THIRD-PARTY-NOTICES.md` copies in `host/package.mjs` and `writeNpmNotices` in `host/build.mjs`; the `notices` step of `scripts/package-native.mjs` for native bundles.
- Record the result under **Breaking / attention**: `License notices: unchanged`, or the exact additions.

### S3. Product code — resolve by combining both sides
This covers `crates/`, `vendor/`, `scripts/`, `src/`, `src-tauri/src/` and `host/`, apart from the paths in S1. Resolve a conflict when both sides' intent is clear and they can coexist:
- **Imports / `use` lists**: add only the missing symbols, at the sorted position. Never import a symbol twice.
- **Additive changes on the same line or list**: keep both.
- **MOLFAR renames vs upstream edits** (Mono → Familiar, `monocode.*` keys → `molfar.*`, camelCase → kebab-case files): apply the upstream logic using MOLFAR's names.
- **MOLFAR refactored or parity-ported a block that upstream changed**: keep MOLFAR's structure and port upstream's new behavior into it.
- **Upstream extracted code into a new module**: take the extraction. Make sure the old inline copy does not survive next to it.

After resolving, check every resolved file:
- `git diff upstream/main -- <path>` and `git diff <base> -- <path>`. Every upstream hunk must be present (possibly adapted), and no MOLFAR-only behavior may be lost.
- Grep for identifiers that upstream removed or moved in this range. None may remain as dead or duplicated code.

### S3a. Pending ports (mandatory whenever `pending` is non-empty)
- Read `.upstream-pending/<from>..<to>/manifest.json`. For each entry, read:
  - its `.diff`;
  - `git log --oneline "$SYNCED"..upstream/main -- <path>`;
  - its move-map entry.
- Find where the code lives now (split `targets`/`notes`, `rg`, codegraph) and port the intent of every hunk in MOLFAR's form. Never recreate a removed file and never paste a monolith back.
- How to handle each reason:
  - `split`: port into the targets.
  - `removed`: port behavior changes into the replacement. Otherwise mark it **Not applicable**, with the reason.
  - `unmapped`: locate the code. For a 1:1 move, add a `renames` entry.
  - `moved-and-renamed-upstream`: keep MOLFAR's path and update the map entry.
  - `apply-failed`: apply it by hand.
- Ported code obeys the project checks (file size, layer boundaries, lint, clippy). Port matching upstream test changes into the MOLFAR test that covers the new location.
- Never commit `.upstream-pending/`. Every pending entry ends as **Ported** (with paths), **Not applicable** (with the reason) or **Needs human** (with what blocks it). A pending entry that needs a product decision does not block the sync: leave MOLFAR's code unchanged for it and list it under **Needs human**.

### S3b. New upstream files (`added`)
- React/TS files: rename to MOLFAR's convention (`kebab-case.ts`, components `PascalCase.tsx`, hooks `use-*.ts`), place them in MOLFAR's structure, and fix imports to MOLFAR paths and the `@/` alias. Record moves in `renames` and splits in `splits`.
- Native bundle scripts and Rust code that reference React sources by path (`import … from "../../src/…"`, `'./src/…'` inside esbuild `stdin`, `include_str!("…/src/…")`) must point at MOLFAR's paths. Check every such path resolves:
  ```bash
  grep -rnoE "(\.\./|\./)+src/[A-Za-z0-9_./-]+" scripts/native-editor scripts/native-settings scripts/*native*.mjs
  grep -rnoE 'include_(str|bytes)!\("[^"]+"' crates/molfar-core/src crates/molfar-gpui/src
  ```
- New Node `*.test.mjs` files that use `node:test` belong to `native:test:dev`, not vitest. Make sure the vitest `exclude` covers them, and add them to the `native:test:dev` script if upstream did not.
- New upstream files over 250 lines (`scripts/`, `src/`): split them like the surrounding MOLFAR code and record the split. The file-size ratchet does not apply to `crates/` and `vendor/`; leave Rust layout as upstream has it unless a MOLFAR port needs otherwise.
- Run `node scripts/upstream/moves.mjs --check` after committing (it reads the committed tree). It must pass.

### S4. Branding and naming scan (mandatory, also on a clean patch)
```bash
git diff <base> -U0 | grep -E '^\+' | grep -v '^+++' | grep -iE 'monocode|usemono|\bmono\b'
```
Any added `monocode` or `usemono` outside the legal/upstream-link allowlist is a defect. Run `node scripts/checks/native-branding.mjs` wherever it exists in the tree (the GPUI branch today; `main` after #127 merges). Fix product identifiers and user-facing text:
- React app: `monocode.*` storage keys → `molfar.*`, `monocode:*` events → `molfar:*`, `MonoCode` UI text and component names → MOLFAR.
- Native user-facing text (window titles, menus, notifications, settings copy, error hints): MonoCode → MOLFAR wherever the branch already shows MOLFAR for the same surface. Check how the same string appears on the base, and in the React source when a native test compares them (for example `hints_match_the_react_source`).
- Mono → Familiar renames that upstream code brought in unrenamed. The opposite also happens: check that the rename map did not change a fixed-size or wire value. Byte literals like `*b"…"` (Carbon FourCharCodes are exactly 4 bytes), protocol ids, persisted keys, and serialized enum tags must keep their length and meaning. Check with `cargo check`, and grep the added lines for `b"` literals.

Leave these alone:
- Copyright lines, license texts and attribution notices.
- Upstream issue/PR links in comments.
- Code that intentionally handles legacy MonoCode data.
- `MonoCode #NNN` references in `CHANGELOG.md`.

Update tests that assert on renamed keys or names in the same way.

## Part A — `main` (desktop paths in Phase 1, everything in Phase 2)

### A1. Range
```bash
SYNCED_MAIN=$(git show origin/main:.github/upstream-sync.json | node -e 'process.stdin.on("data", d => console.log(JSON.parse(d).syncedCommit))')
git merge-base --is-ancestor "$SYNCED_MAIN" upstream/main   # must succeed
git rev-list --count "$SYNCED_MAIN"..upstream/main
```
- Not an ancestor: MonoCode rewrote history. Open `Sync blocked: upstream main diverged (YYYY-MM-DD)` with both commits (and a `git range-diff` hint if content-equal) and skip Part A.
- Count `0`: Part A has nothing to do; go to Part B.
- Never count with `origin/main..upstream/main`: the histories are unrelated.
- Existing open PR whose head starts with `sync/upstream-into-main-`: if its state file is already at `upstream/main`, report its URL and skip Part A. If it is behind, check it out, re-run A2–A5 on it (no second PR), push normally, refresh its PR and Issue bodies for the full range.

### A2. Apply
```bash
git switch -c sync/upstream-into-main-YYYYMMDD origin/main     # append -2, -3 if taken
node scripts/upstream/apply.mjs upstream/main
```
Exit codes: `0` applied, `2` conflicts left, `3` diverged (open the A1 Issue, skip Part A), `4` pending ports in `.upstream-pending/` (conflicts may also exist).

**Phase 1 only — native exclusion.** Native paths belong to Part B until #127 merges. Right after `apply.mjs`, before resolving anything, put every native path back to `origin/main`'s state (restore files that exist there, delete files the patch added):
```bash
NATIVE=(':(glob)crates/monocode-*/**' ':(glob)crates/molfar-*/**' ':(glob)vendor/gpui-pre*/**' 'docs/native' ':(glob)scripts/*native*' 'scripts/native-editor' 'scripts/native-settings' 'scripts/generate-material-icons.mjs' 'scripts/generate-hugeicons.mjs' ':(glob).github/workflows/native*.yml')
git diff --name-only origin/main -- "${NATIVE[@]}" | while read -r p; do
  if git cat-file -e "origin/main:$p" 2>/dev/null; then git checkout origin/main -- "$p"; else git rm -q -f -- "$p"; fi
done
git diff --name-only origin/main -- "${NATIVE[@]}"   # must print nothing
```
Drop `.upstream-pending/` entries for native paths (Part B ports them). In root `Cargo.toml` / `Cargo.lock`, revert only hunks that exist for the native crates and keep the rest. Revert only the `native:*` entries in `package.json`, keep every other upstream change to it. Keep `crates/mobile-link` changes (shared with the desktop app). Then confirm `git diff --stat origin/main` lists no native path. List the excluded native range under **Breaking / attention** as `Native changes: delivered to #127 (Part B)`.

### A3. Resolve
Read `git log --oneline` of the range and the upstream diff of every conflicting or pending file first. Apply the shared adaptation rules above. Port every remaining `.upstream-pending/` entry (S3a), handle new files (S3b), and delete the folder.

### A4. Verify
- `npm ci && npm run check:web`.
- Touched `src-tauri/` or root `Cargo.*`: `cargo check --quiet` in `src-tauri/`. Touched `host/`: `npm run test:host`.
- Phase 2: also `npm run native:check` and `npm run check:native-branding`.
- Fix sync-caused failures in the branch. Failures that also happen on `origin/main` alone are pre-existing: keep going and list them with output.

### A5. Notes, commit, PR, Issue
- Notes use the shared notes format below. Add the user-visible desktop changes under `## [Unreleased]` in `CHANGELOG.md` (Keep a Changelog sections; `MonoCode #NNN` instead of bare `#NNN`; no contributor handles or MonoCode version wording; MOLFAR branding), then `npx vitest run scripts/release/`.
- One commit: `chore(sync): apply MonoCode main <short old>..<short new> (YYYY-MM-DD)` with the upstream subjects in the body; later fixes as separate conventional commits. Stage only the patch, resolutions, ports, state/moves files, branding fixes, `CHANGELOG.md`, regenerated lockfiles.
- Contamination check: one parent (`origin/main`), owner author/committer, and `git merge-base HEAD upstream/main` must **fail**.
- `git push -u origin <branch>`. PR: base `main`, title `sync: MonoCode main into main (YYYY-MM-DD)`, body = notes + Issue link. Issue: `Sync notes: MonoCode → main (YYYY-MM-DD)`, label `sync-notes` if it exists (never create labels). Cross-link. Reuse an open `Sync blocked` Issue for the same range instead of duplicating.
- If the PR reads back `CONFLICTING`, merge `origin/main` into the sync branch, resolve, re-verify, push without force.
- Blocked case (incompatible sides needing a product decision, unclear intent, or checks still failing in sync-touched code after a real effort): discard the local branch, open `Sync blocked: MonoCode → main needs human (YYYY-MM-DD)` with a **Needs human** section (each path, what each side did, recommended resolution, the blocking decision, both hashes, reproduce commands) plus the notes with `Conflict status: Conflicts`.

## Part B — `migration/gpui-into-main` / PR #127 (Phase 1 only)

### B1. Bring `main` into the branch
Work on `sync/gpui-YYYYMMDD` from `origin/migration/gpui-into-main`. If `git rev-list --count HEAD..origin/main` is not `0`, `git merge --no-edit origin/main` (MOLFAR history, allowed). Merge rules: `.github/upstream-sync.json` always **ours** (the GPUI branch's); `.github/upstream-moves.json` union per section, then `node scripts/upstream/moves.mjs --check`; `CHANGELOG.md` take `main`'s released sections and merge `Unreleased`; versions from `main`, lockfiles regenerated; everything else combine both sides.

### B2. Move the state file to the source (once)
Read the GPUI branch's `.github/upstream-sync.json`. If `branch` is `mc/migrate-monocode-to-gpui` and that ref is an ancestor of `upstream/main`, set `branch` to `main` (keep `syncedCommit`) in this sync and say so in the notes. From then on the source for Part B is `upstream/main`.

### B3. Range and apply
```bash
SYNCED_GPUI=$(node -e 'console.log(require("./.github/upstream-sync.json").syncedCommit)')
git merge-base --is-ancestor "$SYNCED_GPUI" upstream/main   # must succeed
git rev-list --count "$SYNCED_GPUI"..upstream/main
node scripts/upstream/apply.mjs upstream/main
```
- Not an ancestor: open `Sync blocked: MonoCode GPUI history rewritten (YYYY-MM-DD)` with both commits, merge-base, counts and a recommendation (`git range-diff`); still push the B1 merge if there is one; skip the rest of Part B.
- Count `0`: push the B1 merge if any, no comment, done.
- This range also contains the desktop changes Part A just ported. They reach this branch twice (through the patch, and later through `main`). Keep exactly one copy and record them as **Already in main / in Part A PR** in the notes.
- `apply.mjs` prints `status`, `commits`, `conflicts`, `pending`, `remapped`, `retargeted`, `added`, `extracted`. Check afterwards that the state file says `"branch": "main"`.

### B4. Pending ports and new files
Apply S3a and S3b to every `pending` and `added` entry. Before resolving a conflict in a native file, read `git log --oneline origin/migration/gpui-into-main -- <path>` to see which MOLFAR commits touched it.

### B5. Verify
- `npm ci && npm run check:web`.
- If the range touched `scripts/native-editor/**`, `scripts/native-settings/**` or the React modules they import, rebuild and commit the bundles: `(cd scripts/native-editor && npm ci) && node scripts/native-editor/build.mjs` and `node scripts/native-settings/build-arcade.mjs`.
- `cargo fmt --manifest-path crates/molfar-gpui/Cargo.toml --all` when the rename map touched Rust, then `npm run native:check` (~15–20 min) and `npm run check:native-branding`.
- Touched `src-tauri/` or root `Cargo.*`: `cargo check --quiet` in `src-tauri/`; touched `host/`: `npm run test:host`.
- Fix sync-caused failures in follow-up commits; failures that also happen on `origin/migration/gpui-into-main` alone do not block the push, list them with output.

### B6. Commit, push, report on #127
- One sync commit `chore(sync): apply MonoCode GPUI <short old>..<short new> (YYYY-MM-DD)` (+ subjects, + one line on resolutions and scan fixes); fixes as separate commits, e.g. `fix(gpui): restore 4-byte hotkey signature after rename`.
- `git merge-base HEAD upstream/main` must **fail**; every new commit has the owner as author and committer.
- Push as a fast-forward:
  ```bash
  git fetch origin migration/gpui-into-main
  git merge-base --is-ancestor origin/migration/gpui-into-main HEAD || git merge --no-edit origin/migration/gpui-into-main
  git push origin HEAD:migration/gpui-into-main
  ```
  If a human pushed meanwhile, merge it in, re-run B5 for the touched areas, push. Never force. Re-check identity, `core.bare` and `git log -5` afterwards.
- Post the notes (shared format, heading `## GPUI sync <old>..<new> (YYYY-MM-DD)`, plus a **Parity impact** section naming the M01–M22 groups touched and whether MOLFAR ports were kept, adapted or need follow-up) with `gh pr comment 127 -R deluminor/molfar --body-file <file>`.
- Update only the `Upstream sync` line of #127's body: `**Upstream sync:** main @ <short head>, last synced YYYY-MM-DD (<comment link>)` (add it under the first heading if missing; change nothing else).
- Native-only changes do **not** go into `CHANGELOG.md` (the GPUI app is an unreleased preview); desktop changes that ride along go under `## [Unreleased]` as in A5.
- Blocked case: reset to the B1 merge (or the branch tip), push the B1 merge if any, open `Sync blocked: MonoCode GPUI → #127 needs human (YYYY-MM-DD)` with **Needs human** + notes, comment a link on #127. Close an older open `Sync blocked` Issue for the same range when the sync succeeds.
- `gh pr view 127 -R deluminor/molfar --json mergeable,isDraft`: its draft/ready status must match the value read at the start of this run. If `CONFLICTING` with `main`, re-run B1 on a fresh branch and push. Never rebase.

## Shared notes format
```markdown
## Summary
2–4 sentences: what this sync brings in.
## Highlights
- Desktop: user-visible changes, related commits grouped.
- Native: meaningful GPUI changes (Part B / Phase 2).
## Breaking / attention
- MOLFAR-owned parts touched, skipped workflows, router-mapping hunks dropped, native exclusion (Part A, Phase 1), license notices (`License notices: unchanged` or the exact additions), branding-scan renames, user-visible default changes (today vs after, how to get the old behavior back), check results with output. `None.` if empty.
## Upstream commits
- Subjects oldest → newest, max ~30; note the remainder.
## Conflict status
- `Clean patch`, or `Resolved` + each path grouped as **Native** / **Desktop & scripts** / **MOLFAR-owned**, one specific line each; **Main merge**, **Already in main**, **Retargeted** / **Ported** / **Not applicable** where relevant.
## Needs human
- Only when something could not be ported or decided.
```
Be specific and honest. Prefer outcomes over hashes. Do not invent changes.

## Verify publication text (mandatory)
Write every body to a UTF-8 file and pass `--body-file`. Read back what you published (`gh pr view -R deluminor/molfar --json title,body,comments`, `gh issue view -R deluminor/molfar --json title,body`). If any attribution, generated-by notice, tool footer or badge was appended, remove only that (`gh pr edit -R deluminor/molfar --body-file`, `gh issue edit -R deluminor/molfar --body-file`, `gh api -X PATCH repos/deluminor/molfar/issues/comments/<id> -F body=@<file>`) and read back again. Do not report success before everything is clean.

## Finish
Final message:
- Phase (1 split / 2 single)
- Part A: range `<old>..<new>` or current · PR URL / Issue URL / blocked Issue URL · conflicts · native paths excluded (Phase 1)
- Part B: range or current · main merge range · pushed commits (short hashes + subjects) or blocked Issue URL · #127 comment URL
- Branding scan fixes · license notice changes
- Checks per part: commands, exit codes, test counts, or what failed
- Needs human items, or none
- One-line highlights

Never merge a PR or change #127's draft/ready status. The human controls review status and merges.
