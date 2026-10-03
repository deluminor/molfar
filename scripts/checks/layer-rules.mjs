/**
 * Import direction (D4, D13, D14 in docs/specs/global-refactor/spec.md):
 * app → features → integrations → platform → domain → shared. `host/` is a separate Node program
 * that may use integrations, domain and shared. Assets and styles are importable from anywhere.
 */
const ALLOWED_TARGETS = {
  app: new Set([
    "app",
    "features",
    "integrations",
    "platform",
    "domain",
    "shared",
    "assets",
  ]),
  features: new Set([
    "features",
    "integrations",
    "platform",
    "domain",
    "shared",
    "assets",
  ]),
  integrations: new Set([
    "integrations",
    "platform",
    "domain",
    "shared",
    "assets",
  ]),
  platform: new Set(["platform", "domain", "shared", "assets"]),
  domain: new Set(["domain", "shared"]),
  shared: new Set(["shared", "assets"]),
  host: new Set(["host", "integrations", "domain", "shared"]),
};

const SRC_LAYERS = new Set([
  "app",
  "integrations",
  "platform",
  "domain",
  "shared",
]);
const ASSET_FOLDERS = new Set(["assets", "styles", "instructions"]);

/** A feature's public surface: files at its root or directly inside its first-level folders. */
const MAX_PUBLIC_FEATURE_DEPTH = 2;

export function classify(path) {
  const parts = path.split("/");
  if (parts[0] === "host") return { layer: "host" };
  if (parts[0] !== "src") return null;
  if (parts.length === 2) return { layer: "app" };

  const [, folder, feature] = parts;
  if (folder === "features")
    return { layer: "features", feature, depth: parts.length - 3 };
  if (SRC_LAYERS.has(folder)) return { layer: folder };
  if (ASSET_FOLDERS.has(folder)) return { layer: "assets" };

  return null;
}

/** The violation kind for an import from `from` to `to` (repo-relative paths), or null when allowed. */
export function importViolation(from, to) {
  const source = classify(from);
  const target = classify(to);
  if (!source || !target || source.layer === "assets") return null;

  if (!ALLOWED_TARGETS[source.layer].has(target.layer))
    return `layer:${source.layer}->${target.layer}`;

  const crossFeature =
    source.layer === "features" &&
    target.layer === "features" &&
    source.feature !== target.feature;
  if (crossFeature && target.depth > MAX_PUBLIC_FEATURE_DEPTH)
    return `feature-internal:${target.feature}`;

  return null;
}
