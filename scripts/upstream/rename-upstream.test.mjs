import { describe, expect, it } from "vitest";
import { KEEP_PHRASES, RENAMES } from "./rename-map.mjs";
import { countTokens, createRenamer, renameToken as renameWith } from "./rename-upstream.mjs";

const renameToken = (token, renames) => renameWith(token, renames, KEEP_PHRASES);



function renamer(paths, tree = "") {
  return createRenamer({
    renames: RENAMES,
    keepPhrases: KEEP_PHRASES,
    paths,
    treeCounts: countTokens(tree, RENAMES),
  });
}

describe("renameToken", () => {
  it("renames every case and the plural", () => {
    expect(renameToken("mono", RENAMES)).toBe("familiar");
    expect(renameToken("monos", RENAMES)).toBe("familiars");
    expect(renameToken("listMonos", RENAMES)).toBe("listFamiliars");
    expect(renameToken("FloatingMonoChat", RENAMES)).toBe("FloatingFamiliarChat");
    expect(renameToken("mono_transcript", RENAMES)).toBe("familiar_transcript");
    expect(renameToken("LEGACY_MONOS_KEY", RENAMES)).toBe("LEGACY_FAMILIARS_KEY");
    expect(renameToken("mono-run-report", RENAMES)).toBe("familiar-run-report");
  });

  it("leaves words that only start with the source word", () => {
    for (const word of ["monospace", "monotonic", "MONOCHROME", "Monokai", "monosyllable"]) {
      expect(renameToken(word, RENAMES)).toBe(word);
    }
  });
});

describe("mapPath", () => {
  const paths = [
    "src/features/familiars/model/familiar.ts",
    "src/features/familiars/ui/FloatingFamiliarChat.tsx",
    "src/app/hooks/useFamiliarHabits.ts",
    "src/styles/monospace.css",
  ];

  it("follows renamed directories and files", () => {
    const { mapPath } = renamer(paths);

    expect(mapPath("src/features/monos/model/mono.ts")).toBe("src/features/familiars/model/familiar.ts");
    expect(mapPath("src/app/hooks/useMonoHabits.ts")).toBe("src/app/hooks/useFamiliarHabits.ts");
  });

  it("renames new upstream files placed under a renamed directory", () => {
    const { mapPath } = renamer(paths);

    expect(mapPath("src/features/monos/ui/MonoOverview.tsx")).toBe("src/features/familiars/ui/FamiliarOverview.tsx");
    expect(mapPath("src/features/monos/ui/HabitsList.tsx")).toBe("src/features/familiars/ui/HabitsList.tsx");
  });

  it("keeps paths MOLFAR did not rename", () => {
    const { mapPath } = renamer([...paths, "src/features/monos/legacy.ts"]);

    expect(mapPath("src/features/monos/legacy.ts")).toBe("src/features/monos/legacy.ts");
    expect(mapPath("src/styles/monospace.css")).toBe("src/styles/monospace.css");
  });
});

describe("translate", () => {
  const paths = ["src/features/familiars/model/familiar.ts", "src/app/App.tsx"];

  it("rewrites relative imports to MOLFAR's paths", () => {
    const { translate } = renamer(paths);
    const text = 'import { listMonos } from "../features/monos/model/mono";\n';

    expect(translate(text, { fromFile: "src/app/App.tsx", toFile: "src/app/App.tsx" })).toBe(
      'import { listFamiliars } from "../features/familiars/model/familiar";\n',
    );
  });

  it("renames mixed-case brand identifiers inside rewritten imports", () => {
    const { translate } = renamer(paths);
    const text = 'import { monoCodeSummary } from "./monoCodeToolCall";\n';

    expect(translate(text, { fromFile: "src/app/App.tsx", toFile: "src/app/App.tsx" })).toBe('import { molfarSummary } from "./molfarToolCall";\n');
  });

  it("re-relativizes imports when the importing file moved", () => {
    const { translate } = renamer(paths);
    const text = 'import { a } from "../model/mono";\n';

    expect(
      translate(text, {
        fromFile: "src/features/monos/ui/MonoOverview.tsx",
        toFile: "src/features/familiars/ui/FamiliarOverview.tsx",
      }),
    ).toBe('import { a } from "../model/familiar";\n');
  });

  it("keeps identifiers the target file still spells the upstream way", () => {
    const { translate } = renamer(paths, "familiarId familiarId");
    const fileText = "const id = record.mono_id;\nsetMonoChanges(null);\n";
    const text = "const id = record.mono_id;\nsetMonoChanges(null);\nopenMono(id);\n";

    expect(translate(text, { fromFile: "a.ts", toFile: "a.ts", fileText })).toBe(
      "const id = record.mono_id;\nsetMonoChanges(null);\nopenFamiliar(id);\n",
    );
  });

  it("falls back to the spelling MOLFAR's tree uses most", () => {
    const { translate } = renamer(paths, "font-mono font-mono monoId familiarName");

    expect(translate('<p className="font-mono">{monoId}</p>', { fromFile: "a.tsx", toFile: "a.tsx" })).toBe(
      '<p className="font-mono">{monoId}</p>',
    );
  });

  it("does not touch font family names", () => {
    const { translate } = renamer(paths);
    const text = 'font-family: "JetBrains Mono", "Liberation Mono", monospace;';

    expect(translate(text, { fromFile: "a.css", toFile: "a.css" })).toBe(text);
  });

  it("renames product names in user-facing text", () => {
    const { translate } = renamer(paths, "Familiar Familiars");

    expect(translate('title="Open Mono settings"', { fromFile: "a.tsx", toFile: "a.tsx" })).toBe(
      'title="Open Familiar settings"',
    );
  });
});


describe("native branding", () => {
  it("does not infer runtime branding from a preserved upstream URL", () => {
    const r = renamer([]);
    expect(r.translate('"monocode"', {fromFile: "x.rs", toFile: "x.rs", fileText: "https://github.com/hardbeat920/monocode/pull/1"})).toBe('"molfar"');
    expect(r.translate("--monocode-db PATH open_monocode monocode_database", {fromFile: "x.rs", toFile: "x.rs"})).toBe("--desktop-db PATH open_desktop desktop_database");
  });
  it("follows existing file spelling for standalone brand and type tokens", () => {
    const r = renamer([]);
    expect(r.translate('"Monocode Native"', {fromFile: "x.rs", toFile: "x.rs", fileText: '"MOLFAR Native"'})).toBe('"MOLFAR Native"');
    expect(r.translate("struct MonoCode;", {fromFile: "x.rs", toFile: "x.rs", fileText: "struct Molfar;"})).toBe("struct Molfar;");
  });
  it("translates crate paths and all brand case forms before familiar names", () => {
    const r = renamer(["crates/molfar-core/src/store.rs"]);
    expect(r.mapPath("crates/monocode-core/src/new.rs")).toBe("crates/molfar-core/src/new.rs");
    const translate = (text) => r.translate(text, { fromFile: "x.rs", toFile: "x.rs" });
    expect(translate('"Monocode Native" "MonoCode"')).toBe('"MOLFAR Native" "MOLFAR"');
    expect(translate("MonocodeArtifactClip MonoCodeCallRow MONOCODE_APP_TOKEN monocode_core::store monocode-gpui MONOCODE_X Monocode"))
      .toBe("MolfarArtifactClip MolfarCallRow MOLFAR_APP_TOKEN molfar_core::store molfar-gpui MOLFAR_X MOLFAR");
  });
  it("preserves legal attribution, issue references and upstream links", () => {
    const r = renamer([]);
    const source = 'MOLFAR is derived from MonoCode.\nCopyright MonoCode\nSPDX-License-Identifier: MIT\nMonoCode #1142\nhttps://github.com/hardbeat920/monocode/pull/1142';
    expect(r.translate(source, {fromFile: "x.rs", toFile: "x.rs"})).toBe(source);
  });
});
