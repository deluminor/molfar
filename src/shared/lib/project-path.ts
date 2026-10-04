import { slash } from "./paths";

export function normalizeProjectPath(path: string): string {
  return slash(path).replace(/\/+$/, "") || "/";
}
