import { afterEach, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readdirSync,
  utimesSync,
} from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { version } from "../package.json";

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
function fixture(badChecksum = false) {
  const dir = mkdtempSync(join(tmpdir(), "vatra-bootstrap-"));
  directories.push(dir);
  const base = join(dir, "host with spaces ' and $data");
  const source = join(dir, "source");
  const bin = join(dir, "tools");
  mkdirSync(source);
  mkdirSync(bin);
  writeFileSync(
    join(source, "vatra-host"),
    `#!/bin/sh\ncase "$1" in\n--version) printf '%s\\n' ${quote(version)} ;;\nservice) printf 'service %s\\n' "$2" >> "$VATRA_TEST_EVENTS"; [ "$2" != install ] || [ -z "$VATRA_TEST_FAIL_INSTALL" ] ;;\nconnection-info) printf '{"port":3774,"pid":123}\\n' ;;\n*) exit 1 ;;\nesac\n`,
    { mode: 0o755 },
  );
  const archive = join(dir, "host.tar.gz");
  execFileSync("tar", ["-czf", archive, "-C", source, "."]);
  const checksum = badChecksum
    ? "0".repeat(64)
    : createHash("sha256").update(readFileSync(archive)).digest("hex");
  writeFileSync(join(dir, "checksum"), `${checksum}  package.tar.gz\n`);
  // A local download fixture: run the real installer shell, without network or
  // a user service. Never change the test runner's HOME or installed services.
  writeFileSync(
    join(bin, "curl"),
    `#!/bin/sh\nfor arg do previous="$last"; last="$arg"; done\ncase "$previous" in -o) ;; *) exit 1 ;; esac\ncase "$last" in */checksum) cp "$VATRA_TEST_CHECKSUM" "$last" ;; *) cp "$VATRA_TEST_ARCHIVE" "$last" ;; esac\nprintf 'download\\n' >> "$VATRA_TEST_DOWNLOADS"\n`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "cp"),
    `#!/bin/sh\ncase "$*" in *"$VATRA_TEST_FAIL_COPY"*) [ -z "$VATRA_TEST_FAIL_COPY" ] || exit 1 ;; esac\nexec /bin/cp "$@"\n`,
    { mode: 0o755 },
  );
  const legacy = join(dir, "legacy monocode ' host");
  const script = readFileSync("src-tauri/src/remote_bootstrap.sh", "utf8")
    .replace('BASE="$HOME/.vatra-host"', `BASE=${quote(base)}`)
    .replace('LEGACY_BASE="$HOME/.monocode-host"', `LEGACY_BASE=${quote(legacy)}`)
    .replace("@@VERSION@@", quote(version))
    .replace("@@RELEASE@@", "'https://example.invalid/releases'");
  const run = (forceUpgrade = false, env: Record<string, string> = {}) =>
    new Promise<{ code: number | null; out: string; error: string }>(
      (resolve, reject) => {
        const child = spawn("sh", ["-s"], {
          env: {
            ...process.env,
            PATH: `${bin}:/usr/bin:/bin`,
            VATRA_TEST_ARCHIVE: archive,
            VATRA_TEST_CHECKSUM: join(dir, "checksum"),
            VATRA_TEST_EVENTS: join(dir, "events"),
            VATRA_TEST_DOWNLOADS: join(dir, "downloads"),
            VATRA_HOST_FORCE_UPGRADE: forceUpgrade ? "1" : "0",
            ...env,
          },
          signal: AbortSignal.timeout(10_000),
        });
        let out = "";
        let error = "";
        child.stdout.on("data", (data) => {
          out += data;
        });
        child.stderr.on("data", (data) => {
          error += data;
        });
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, out, error }));
        child.stdin.end(script);
      },
    );
  return { dir, base, legacy, run };
}

/** A MonoCode-era install: a launcher that tracks whether its host runs. */
function installLegacyHost(legacy: string) {
  mkdirSync(join(legacy, "bin"), { recursive: true });
  mkdirSync(join(legacy, "attachments"));
  writeFileSync(join(legacy, "host.db"), "legacy db");
  writeFileSync(join(legacy, "host.db-wal"), "legacy wal");
  writeFileSync(join(legacy, "attachments/shot.png"), "png");
  writeFileSync(join(legacy, "running.json"), "{}");
  writeFileSync(join(legacy, "owner.lock"), "{}");
  writeFileSync(join(legacy, "running"), "");
  writeFileSync(
    join(legacy, "bin/monocode-host"),
    `#!/bin/sh
state="$(dirname "$0")/../running"
log() { printf 'legacy %s\n' "$1" >> "$VATRA_TEST_EVENTS"; }
case "$1 $2" in
  "service uninstall") log "service uninstall"; [ -n "$VATRA_TEST_LEGACY_STUCK" ] || rm -f "$state" ;;
  "service install") log "service install $4"; touch "$state" ;;
  stop*) log stop; [ -n "$VATRA_TEST_LEGACY_STUCK" ] || rm -f "$state" ;;
  connection-info*) [ -e "$state" ] && printf '{"port":4100,"pid":1}\\n' ;;
  *) exit 1 ;;
esac
`,
    { mode: 0o755 },
  );
}

const events = (dir: string) =>
  readFileSync(join(dir, "events"), "utf8").trim().split("\n");
it.skipIf(process.platform === "win32")(
  "installs a verified package, handles unusual home paths, and reuses its host on reconnect",
  async () => {
    const { dir, base, run } = fixture();
    const first = await run();
    expect(first.error).toBe("");
    expect(first.code).toBe(0);
    expect(JSON.parse(first.out).port).toBe(3774);
    expect(existsSync(join(base, "bin/vatra-host"))).toBe(true);
    expect((await run()).code).toBe(0);
    expect(
      readFileSync(join(dir, "downloads"), "utf8").trim().split("\n"),
    ).toHaveLength(2);
  },
);
it.skipIf(process.platform === "win32")(
  "updates an existing host only when requested, then restarts its service",
  async () => {
    const { dir, base, run } = fixture();
    expect((await run()).code).toBe(0);
    const oldRuntime = readFileSync(join(base, "runtime-path"), "utf8");
    expect((await run(true)).code).toBe(0);
    expect(readFileSync(join(base, "runtime-path"), "utf8")).not.toBe(
      oldRuntime,
    );
    expect(
      readFileSync(join(dir, "events"), "utf8").trim().split("\n"),
    ).toEqual(["service install", "service uninstall", "service install"]);
    expect(
      readFileSync(join(dir, "downloads"), "utf8").trim().split("\n"),
    ).toHaveLength(4);
  },
);
it.skipIf(process.platform === "win32")(
  "rejects a corrupted package before executing or publishing it",
  async () => {
    const { dir, base, run } = fixture(true);
    const result = await run();
    expect(result.code).not.toBe(0);
    expect(result.error).toContain("checksum mismatch");
    expect(existsSync(join(base, "bin/vatra-host"))).toBe(false);
    expect(existsSync(join(dir, "events"))).toBe(false);
  },
);

it.skipIf(process.platform === "win32")(
  "retires a MonoCode-era host once and carries its state over",
  async () => {
    const { dir, base, legacy, run } = fixture();
    installLegacyHost(legacy);

    const first = await run();

    expect(first.error).toBe("");
    expect(first.code).toBe(0);
    expect(events(dir)).toEqual(["legacy service uninstall", "service install"]);
    expect(readFileSync(join(base, "host.db"), "utf8")).toBe("legacy db");
    expect(readFileSync(join(base, "host.db-wal"), "utf8")).toBe("legacy wal");
    expect(readFileSync(join(base, "attachments/shot.png"), "utf8")).toBe("png");
    expect(existsSync(join(base, "running.json"))).toBe(false);
    expect(existsSync(join(base, "owner.lock"))).toBe(false);
    expect(existsSync(join(base, ".legacy-migration"))).toBe(false);
    expect(readFileSync(join(legacy, "host.db"), "utf8")).toBe("legacy db");
    expect(existsSync(join(legacy, "attachments/shot.png"))).toBe(true);

    expect((await run()).code).toBe(0);
    expect(events(dir)).toEqual([
      "legacy service uninstall",
      "service install",
      "service install",
    ]);
  },
);
it.skipIf(process.platform === "win32")(
  "never overwrites state the Vatra host already has",
  async () => {
    const { base, legacy, run } = fixture();
    installLegacyHost(legacy);
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, "host.db"), "vatra db");

    expect((await run()).code).toBe(0);

    expect(readFileSync(join(base, "host.db"), "utf8")).toBe("vatra db");
    expect(existsSync(join(base, "host.db-wal"))).toBe(false);
    expect(existsSync(join(base, "legacy-retired"))).toBe(true);
  },
);
it.skipIf(process.platform === "win32")(
  "keeps the legacy host when it cannot be stopped",
  async () => {
    const { dir, base, legacy, run } = fixture();
    installLegacyHost(legacy);

    const result = await run(false, { VATRA_TEST_LEGACY_STUCK: "1" });

    expect(result.code).not.toBe(0);
    expect(result.error).toContain("could not be stopped");
    expect(events(dir)).toEqual([
      "legacy service uninstall",
      "legacy stop",
      "legacy service install 4100",
    ]);
    expect(existsSync(join(base, "host.db"))).toBe(false);
    expect(existsSync(join(base, "legacy-retired"))).toBe(false);
  },
);
it.skipIf(process.platform === "win32")(
  "restores the legacy host when the Vatra host fails to start",
  async () => {
    const { dir, base, legacy, run } = fixture();
    installLegacyHost(legacy);

    const result = await run(false, { VATRA_TEST_FAIL_INSTALL: "1" });

    expect(result.code).not.toBe(0);
    expect(result.error).toContain("service setup failed");
    expect(events(dir)).toEqual([
      "legacy service uninstall",
      "service install",
      "legacy service install 4100",
    ]);
    expect(existsSync(join(base, "host.db"))).toBe(false);
    expect(existsSync(join(base, "attachments"))).toBe(false);
    expect(existsSync(join(base, "legacy-retired"))).toBe(false);
    expect(readFileSync(join(legacy, "host.db"), "utf8")).toBe("legacy db");
    expect(existsSync(join(legacy, "running"))).toBe(true);
  },
);
it.skipIf(process.platform === "win32")(
  "restores the legacy host when its state cannot be copied",
  async () => {
    const { dir, base, legacy, run } = fixture();
    installLegacyHost(legacy);

    const result = await run(false, { VATRA_TEST_FAIL_COPY: "/attachments" });

    expect(result.code).not.toBe(0);
    expect(result.error).toContain("previous host was restored");
    expect(events(dir)).toEqual([
      "legacy service uninstall",
      "legacy service install 4100",
    ]);
    expect(existsSync(join(base, "host.db"))).toBe(false);
    expect(existsSync(join(base, "legacy-retired"))).toBe(false);
    expect(existsSync(join(base, ".legacy-migration"))).toBe(false);
    expect(
      readdirSync(base).filter((name) => name.startsWith(".legacy-copy")),
    ).toEqual([]);
    expect(existsSync(join(legacy, "running"))).toBe(true);
  },
);
it.skipIf(process.platform === "win32")(
  "reclaims a migration lock left by a killed run",
  async () => {
    const { base, legacy, run } = fixture();
    installLegacyHost(legacy);
    mkdirSync(join(base, ".legacy-migration"), { recursive: true });
    writeFileSync(join(base, ".legacy-migration/pid"), "2147483646");

    const result = await run();

    expect(result.code).toBe(0);
    expect(existsSync(join(base, "legacy-retired"))).toBe(true);
    expect(existsSync(join(base, ".legacy-migration"))).toBe(false);
  },
);
it.skipIf(process.platform === "win32")(
  "reclaims an old migration lock that never recorded its owner",
  async () => {
    const { base, legacy, run } = fixture();
    installLegacyHost(legacy);
    const lock = join(base, ".legacy-migration");
    mkdirSync(lock, { recursive: true });
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    utimesSync(lock, anHourAgo, anHourAgo);

    expect((await run()).code).toBe(0);

    expect(existsSync(join(base, "legacy-retired"))).toBe(true);
  },
);
it.skipIf(process.platform === "win32")(
  "drops sidecars an interrupted run left without their database",
  async () => {
    const { base, legacy, run } = fixture();
    installLegacyHost(legacy);
    rmSync(join(legacy, "host.db-wal"));
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, "host.db-wal"), "stale wal");

    expect((await run()).code).toBe(0);

    expect(readFileSync(join(base, "host.db"), "utf8")).toBe("legacy db");
    expect(existsSync(join(base, "host.db-wal"))).toBe(false);
  },
);
