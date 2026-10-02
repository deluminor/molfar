# Releasing Vatra

Vatra ships its own releases from the `custom` branch of `deluminor/vatra`: desktop installers, the remote host packages, and the signed feed the app updates from. Upstream MonoCode releases are not used for anything.

## Cut a release

1. Merge the work into `custom` and make sure CI is green.
2. Optional: write the notes under `## [Unreleased]` in `CHANGELOG.md` (Keep a Changelog sections: Added, Changed, Fixed, Removed).
3. **Actions → Release → Run workflow**, branch `custom`, version `patch`, `minor`, `major`, or an exact `X.Y.Z`.

The workflow then:

- bumps `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock` and `tauri.conf.json` (`scripts/release/prepare.mjs`);
- writes the release section of `CHANGELOG.md` — an existing `## [X.Y.Z]` section is kept, otherwise the `Unreleased` notes are promoted, otherwise notes are generated from conventional commits since the previous tag (`feat` → Added, `fix` → Fixed, `perf`/`refactor`/`revert`/other → Changed; `chore`, `ci`, `docs`, `test`, `build`, `style` and merges are skipped);
- opens a `release/vX.Y.Z` branch, squash-merges a PR into `custom` (required by the branch ruleset), tags the merge commit, and pushes the tag (re-run if the PR conflicts because `custom` moved);
- builds macOS (arm64 + x64), Windows, Linux (`.deb`, AppImage, `.rpm`) and the six host packages from that tag;
- publishes the GitHub release with the changelog section as its body, plus `latest.json` for in-app updates.

Pushing a `vX.Y.Z` tag yourself runs the same build, provided the tag points at a commit on `custom` and the manifests and changelog already carry that version (`scripts/release/verify.mjs`).

A failed build leaves the release as a draft; use **Re-run failed jobs** on that run to resume it (starting a new run would try to bump the version again). Published releases are never modified.

## Versions

Vatra uses its own semver line, starting at 1.0.0. The remote host must match the desktop version exactly — SSH setup downloads `vatra-host-<os>-<arch>` from the release of the running app's version — so every release must include the host packages (the workflow refuses to publish without all six).

## Signing

| What | Key | Where it lives |
| --- | --- | --- |
| Update packages (`.app.tar.gz`, NSIS `.exe`) | Tauri updater key (minisign) | Secrets `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; public key in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` |
| macOS app | Apple Developer ID (optional) | Secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_API_KEY`, `APPLE_API_KEY_P8`, `APPLE_API_ISSUER` |

**Keep a backup of the updater private key and its password outside GitHub** (a password manager). Installed apps only accept updates signed by that key: if it is lost, every existing install has to be updated by hand once with a build carrying a new public key. If it leaks, set `APP_UPDATER_DISABLED = true` in `src/app/model/forkPolicy.ts` (and `src-tauri/src/menu.rs`), rotate the key, and ship a manual release.

Without the Apple secrets the macOS build is ad-hoc signed and not notarized; users confirm the first launch once (see README → Download). Adding the secrets switches the workflow to signing and notarization automatically.

## Syncing from upstream

These parts are fork-owned; keep ours when porting upstream changes:

- `.github/workflows/release.yml`, `scripts/release/`
- `src/app/model/forkPolicy.ts`, `plugins.updater` in `src-tauri/tauri.conf.json`
- `RELEASE_DOWNLOAD_BASE` in `src-tauri/src/remote_ssh.rs`, `src-tauri/src/remote_bootstrap.{sh,ps1}`
- host names in `host/` (`~/.vatra-host`, `vatra-host`, `com.vatra.host`, `Vatra Host-<SID>`, the `host.vatra` capability)
- version numbers and `CHANGELOG.md`
