import { describe, expect, it } from "vitest";
import { KEEP_PHRASES } from "./rename-map.mjs";
import { countTokens, createRenamer, renameToken as renameWith } from "./rename-upstream.mjs";

const renameToken = (token, renames) => renameWith(token, renames, KEEP_PHRASES);

const RENAMES = [{ from: "mono", to: "familiar" }];

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
    for (const word of ["monospace", "monocode", "MonoCode", "monotonic", "MONOCHROME", "Monokai", "monosyllable"]) {
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

  it("keeps protected words inside rewritten imports", () => {
    const { translate } = renamer(paths);
    const text = 'import { monoCodeSummary } from "./monoCodeToolCall";\n';

    expect(translate(text, { fromFile: "src/app/App.tsx", toFile: "src/app/App.tsx" })).toBe(text);
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
