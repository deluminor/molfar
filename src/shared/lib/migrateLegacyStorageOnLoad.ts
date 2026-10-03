import { migrateLegacyStorage } from "./legacyStorageMigration";

// Imported first by every window entry so no module reads a setting before
// its pre-rename value has been copied over.
try {
  migrateLegacyStorage(localStorage);
} catch (error) {
  console.error("[vatra] legacy settings migration failed", error);
}
