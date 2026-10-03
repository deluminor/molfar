import { describe, expect, it } from "vitest";
import { borrowRepositoryLicenses, LICENSE_FILE, renderNotices } from "./render-notices.mjs";

describe("renderNotices", () => {
  it("prints a shared license text once for every crate that ships it", () => {
    const notices = renderNotices([
      { name: "a", version: "1.0.0", license: "MIT", texts: ["MIT text\n"] },
      { name: "b", version: "2.0.0", license: "MIT", texts: ["MIT text"] },
      { name: "c", version: "0.1.0", license: "Apache-2.0", texts: ["Apache text"] },
    ]);

    expect(notices).toContain("## a 1.0.0 (MIT), b 2.0.0 (MIT)\n\n````text\nMIT text\n````");
    expect(notices).toContain("## c 0.1.0 (Apache-2.0)\n\n````text\nApache text\n````");
    expect(notices.match(/MIT text/g)).toHaveLength(1);
  });

  it("points to the source of MPL-licensed crates", () => {
    const notices = renderNotices([
      { name: "cssparser", version: "0.29.6", license: "MPL-2.0", texts: ["MPL text"] },
      { name: "serde", version: "1.0.0", license: "MIT OR Apache-2.0", texts: ["MIT text"] },
    ]);

    expect(notices).toContain("- cssparser 0.29.6 (MPL-2.0): https://crates.io/crates/cssparser/0.29.6");
    expect(notices).not.toContain("crates.io/crates/serde");
  });

  it("lists crates without license files with their declared license", () => {
    const notices = renderNotices([{ name: "bare", version: "0.3.0", license: "MIT OR Apache-2.0", texts: [] }]);

    expect(notices).toContain("## Packages without bundled license files");
    expect(notices).toContain("- bare 0.3.0 (MIT OR Apache-2.0)");
  });
});

describe("borrowRepositoryLicenses", () => {
  it("uses a sibling crate's license files from the same repository", () => {
    const crates = borrowRepositoryLicenses([
      { name: "alloc-stdlib", repository: "https://github.com/dropbox/rust-alloc-no-stdlib", texts: [] },
      { name: "alloc-no-stdlib", repository: "https://github.com/dropbox/rust-alloc-no-stdlib/", texts: ["BSD text"] },
    ]);

    expect(crates[0]).toMatchObject({ texts: ["BSD text"], licenseSource: "alloc-no-stdlib" });
    expect(crates[1]).toMatchObject({ texts: ["BSD text"] });
    expect(crates[1].licenseSource).toBeUndefined();
  });

  it("leaves a crate without files when no sibling has them", () => {
    const crates = borrowRepositoryLicenses([
      { name: "unic-common", repository: "https://github.com/open-i18n/rust-unic/", texts: [] },
      { name: "unic-char-range", repository: "https://github.com/open-i18n/rust-unic/", texts: [] },
      { name: "no-repo", repository: null, texts: [] },
    ]);

    expect(crates.map((crate) => crate.texts)).toEqual([[], [], []]);
  });
});

describe("renderNotices with borrowed licenses", () => {
  it("says where a borrowed license text comes from", () => {
    const notices = renderNotices([
      { name: "alloc-stdlib", version: "0.2.4", license: "BSD-3-Clause", texts: ["BSD text"], licenseSource: "alloc-no-stdlib" },
    ]);

    expect(notices).toContain("## alloc-stdlib 0.2.4 (BSD-3-Clause; license file from alloc-no-stdlib, same repository)");
  });
});

describe("LICENSE_FILE", () => {
  it("matches common license file names and nothing else", () => {
    const names = ["LICENSE", "LICENSE-MIT", "LICENSE-APACHE", "license.txt", "COPYING", "NOTICE", "UNLICENSE", "COPYRIGHT"];

    expect(names.every((name) => LICENSE_FILE.test(name))).toBe(true);
    expect(["README.md", "Cargo.toml", "licenses"].some((name) => LICENSE_FILE.test(name))).toBe(false);
  });
});
