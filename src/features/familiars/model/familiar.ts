import { projectKey, projectName } from "../../../shared/lib/paths";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupLabels,
  loadTabGroupMascots,
  resolveTabGroupColor,
  resolveTabGroupLabel,
  resolveTabGroupMascot,
  TAB_GROUP_COLORS,
} from "../../workspace/model/tabGroups";
import {
  hasPendingApproval,
  type Block,
  type Session,
} from "../../sessions/model/session";
import {
  PROJECT_MASCOTS,
  projectMascot,
} from "../../projects/model/projectMascots";
import { removeFamiliarBackground } from "./familiarBackground";

/** The project palette's colors, plus indigo for a Familiar's ninth preset. */
export const FAMILIAR_COLORS = [
  ...TAB_GROUP_COLORS.slice(1),
  "hsl(245 75% 65%)",
] as const;

/**
 * A Familiar is a long-lived agent of its own: a name, a mascot and a color, one
 * conversation, and the projects it works on. It is not tied to any one of
 * them; it lives on the rail beside the projects and can be given more.
 */
export type Familiar = {
  id: string;
  /** Its conversation; absent until it is first opened. */
  sessionId?: string;
  /** Replaces the mascot's own name. */
  name?: string;
  mascot: string;
  color: string;
  /** Project folders it works on, in the order they were added. */
  projects: string[];
  /** New sessions appear in the project sidebar unless explicitly disabled. */
  showStartedSessionsInSidebar?: boolean;
  /** Files the sessions it starts into a sidebar folder named after it. */
  useSidebarFolders?: boolean;
  /** Superseded by SOUL.md; only read once, to seed it. */
  instructions?: string;
  /**
   * From when each project had its own Familiar: the project whose agent folder
   * it inherits. The folder moves under its id the first time it is read.
   */
  legacyProject?: string;
};

const ROSTER_KEY = "molfar:familiar-roster";
const FAMILIARS_CHANGED = "molfar:familiars-changed";
export const HANDED_KEY = "molfar:familiar-handed";
const INTRO_DISMISSED_KEY = "molfar:familiar-intro-dismissed";

/** Storage from when each project had one Familiar, keyed by project. */
const LEGACY_AGENTS_KEY = "molfar:familiars";
const LEGACY_PROFILES_KEY = "molfar:familiar-profiles";

/**
 * Keys from the upstream Mono naming. Copied onto Familiar keys once, then
 * removed, so existing rosters survive the rename.
 */
const MONO_KEYS: [string, string][] = [
  ["molfar:mono-roster", ROSTER_KEY],
  ["molfar:mono-handed", HANDED_KEY],
  ["molfar:monos", LEGACY_AGENTS_KEY],
  ["molfar:mono-profiles", LEGACY_PROFILES_KEY],
  ["molfar:mono-intro-dismissed", INTRO_DISMISSED_KEY],
];

/** And from before Familiars had their name. */
const LEGACY_KEYS: [string, string][] = [
  ["molfar:project-agents", LEGACY_AGENTS_KEY],
  ["molfar:project-agent-profiles", LEGACY_PROFILES_KEY],
  ["molfar:project-agent-handed", HANDED_KEY],
];

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

let migrated = false;

/**
 * Turns each project's Familiar into one of its own that works on that project,
 * keeping its conversation, name and look. One never claimed is dropped.
 */
function moveLocalStorageKey(from: string, to: string): void {
  const value = localStorage.getItem(from);
  if (value == null) return;
  if (localStorage.getItem(to) == null) localStorage.setItem(to, value);
  localStorage.removeItem?.(from);
}

/** Renames `mono:<id>` chat-background entries to `familiar:<id>`. */
function migrateMonoBackgroundKeys(): void {
  const key = "molfar:project-chat-backgrounds";
  const raw = localStorage.getItem(key);
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
  const store = parsed as Record<string, unknown>;
  let changed = false;
  for (const [entry, value] of Object.entries(store)) {
    if (!entry.startsWith("mono:")) continue;
    const next = `familiar:${entry.slice("mono:".length)}`;
    if (store[next] == null) store[next] = value;
    delete store[entry];
    changed = true;
  }
  if (changed) localStorage.setItem(key, JSON.stringify(store));
}

export function migrateLegacyFamiliarStorage(): void {
  if (migrated) return;
  migrated = true;
  try {
    for (const [from, to] of MONO_KEYS) moveLocalStorageKey(from, to);
    migrateMonoBackgroundKeys();
    for (const [legacy, key] of LEGACY_KEYS) moveLocalStorageKey(legacy, key);
    if (localStorage.getItem(ROSTER_KEY) != null) return;
    const agents = record(readJson(LEGACY_AGENTS_KEY));
    const profiles = record(readJson(LEGACY_PROFILES_KEY));
    const mascots = loadTabGroupMascots();
    const colors = loadTabGroupColors();
    const customColors = loadTabGroupCustomColors();
    const roster: Familiar[] = [];
    for (const project of new Set([
      ...Object.keys(agents),
      ...Object.keys(profiles),
    ])) {
      const sessionId = agents[project];
      const profile = record(profiles[project]);
      if (typeof sessionId !== "string" && profile.claim !== "claimed")
        continue;
      const seed = projectName(project);
      roster.push({
        id: newFamiliarId(),
        ...(typeof sessionId === "string" ? { sessionId } : {}),
        ...(typeof profile.name === "string" && profile.name.trim()
          ? { name: profile.name }
          : {}),
        mascot: projectMascot(seed, resolveTabGroupMascot(project, mascots))
          .name,
        color: resolveTabGroupColor(project, colors, customColors, seed),
        projects: [project],
        ...(typeof profile.instructions === "string" &&
        profile.instructions.trim()
          ? { instructions: profile.instructions }
          : {}),
        legacyProject: project,
      });
    }
    localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
    localStorage.removeItem?.(LEGACY_AGENTS_KEY);
    localStorage.removeItem?.(LEGACY_PROFILES_KEY);
  } catch {
    // Storage unavailable: there is nothing to move either.
  }
}

function newFamiliarId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseFamiliar(value: unknown): Familiar | undefined {
  const entry = record(value);
  if (typeof entry.id !== "string" || !/^[A-Za-z0-9-]+$/.test(entry.id))
    return undefined;
  const text = (key: string) =>
    typeof entry[key] === "string" ? (entry[key] as string) : undefined;
  const sessionId = text("sessionId");
  const name = text("name");
  const instructions = text("instructions");
  const legacyProject = text("legacyProject");
  return {
    id: entry.id,
    ...(sessionId ? { sessionId } : {}),
    ...(name ? { name } : {}),
    mascot: text("mascot") ?? PROJECT_MASCOTS[0].name,
    color: text("color") ?? TAB_GROUP_COLORS[1],
    projects: Array.isArray(entry.projects)
      ? entry.projects.filter(
          (path): path is string => typeof path === "string" && !!path,
        )
      : [],
    ...(typeof entry.showStartedSessionsInSidebar === "boolean"
      ? { showStartedSessionsInSidebar: entry.showStartedSessionsInSidebar }
      : {}),
    ...(entry.useSidebarFolders === true ? { useSidebarFolders: true } : {}),
    ...(instructions ? { instructions } : {}),
    ...(legacyProject ? { legacyProject } : {}),
  };
}

/** Every Familiar, in the order the rail shows them. */
export function listFamiliars(): Familiar[] {
  migrateLegacyFamiliarStorage();
  const parsed = readJson(ROSTER_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry) => parseFamiliar(entry) ?? []);
}

function saveRoster(roster: readonly Familiar[]): void {
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
  } catch {
    return;
  }
  window.dispatchEvent(new CustomEvent(FAMILIARS_CHANGED));
}

export function findFamiliar(id: string): Familiar | undefined {
  return listFamiliars().find((familiar) => familiar.id === id);
}

/** The Familiar whose conversation this is. */
export function familiarForSession(sessionId: string): Familiar | undefined {
  return listFamiliars().find((familiar) => familiar.sessionId === sessionId);
}

export function isFamiliarSession(sessionId: string): boolean {
  return !!familiarForSession(sessionId);
}

/**
 * The mascot and color the next Familiar gets: ones the others are not using yet,
 * where any are left.
 */
export function nextFamiliarLook(
  roster: readonly Pick<Familiar, "mascot" | "color">[] = listFamiliars(),
): { mascot: string; color: string } {
  const mascots = new Set(roster.map((familiar) => familiar.mascot));
  const colors = new Set(roster.map((familiar) => familiar.color));
  const palette = FAMILIAR_COLORS;
  return {
    mascot: (
      PROJECT_MASCOTS.find((mascot) => !mascots.has(mascot.name)) ??
      PROJECT_MASCOTS[roster.length % PROJECT_MASCOTS.length]
    ).name,
    color:
      palette.find((color) => !colors.has(color)) ??
      palette[roster.length % palette.length],
  };
}

/** A new Familiar with the next look, starting with the projects given, if any. */
export function createFamiliar(projects: readonly string[] = []): Familiar {
  const roster = listFamiliars();
  const familiar: Familiar = {
    id: newFamiliarId(),
    ...nextFamiliarLook(roster),
    projects: uniqueProjects(projects),
  };
  saveRoster([...roster, familiar]);
  return familiar;
}

/** Whether the user passed on the intro that meets them before any Familiar. */
export function familiarIntroDismissed(): boolean {
  try {
    return localStorage.getItem(INTRO_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissFamiliarIntro(): void {
  try {
    localStorage.setItem(INTRO_DISMISSED_KEY, "1");
  } catch {
    // It shows again next launch; harmless.
  }
  window.dispatchEvent(new CustomEvent(FAMILIARS_CHANGED));
}

function uniqueProjects(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = projectKey(path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function updateFamiliar(
  id: string,
  change: (familiar: Familiar) => Familiar,
): Familiar | undefined {
  const roster = listFamiliars();
  const index = roster.findIndex((familiar) => familiar.id === id);
  if (index < 0) return undefined;
  const next = change(roster[index]);
  if (!next.name?.trim()) delete next.name;
  if (!next.instructions?.trim()) delete next.instructions;
  next.projects = uniqueProjects(next.projects);
  roster[index] = next;
  saveRoster(roster);
  return next;
}

/** Forgets the Familiar and its background. Its folder of files stays on disk. */
export function removeFamiliar(id: string): void {
  removeFamiliarBackground(id);
  saveRoster(listFamiliars().filter((familiar) => familiar.id !== id));
}

export function reorderFamiliars(ids: readonly string[]): void {
  const roster = listFamiliars();
  const order = new Map(ids.map((id, index) => [id, index]));
  saveRoster(
    [...roster].sort(
      (a, b) =>
        (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    ),
  );
}

export function saveFamiliarSessionId(familiarId: string, sessionId: string): void {
  updateFamiliar(familiarId, (familiar) => ({ ...familiar, sessionId }));
}

export function saveFamiliarName(familiarId: string, name: string): void {
  updateFamiliar(familiarId, (familiar) => ({ ...familiar, name }));
}

export function saveFamiliarMascot(familiarId: string, mascot: string): void {
  updateFamiliar(familiarId, (familiar) => ({ ...familiar, mascot }));
}

export function addFamiliarProject(familiarId: string, path: string): void {
  updateFamiliar(familiarId, (familiar) => ({
    ...familiar,
    projects: [...familiar.projects, path],
  }));
}

export function removeFamiliarProject(familiarId: string, path: string): void {
  const key = projectKey(path);
  updateFamiliar(familiarId, (familiar) => ({
    ...familiar,
    projects: familiar.projects.filter((project) => projectKey(project) !== key),
  }));
}

/** Whether the Familiar has been given this project. */
export function familiarWorksOn(familiar: Pick<Familiar, "projects">, path: string) {
  const key = projectKey(path);
  return familiar.projects.some((project) => projectKey(project) === key);
}

export function subscribeFamiliars(onChange: () => void): () => void {
  window.addEventListener(FAMILIARS_CHANGED, onChange);
  return () => window.removeEventListener(FAMILIARS_CHANGED, onChange);
}

/**
 * Snapshot for `useSyncExternalStore`; stable while storage is unchanged.
 * Project labels are part of it, since a Familiar's look names its projects.
 */
export function familiarsSnapshot(): string {
  migrateLegacyFamiliarStorage();
  try {
    return `${localStorage.getItem(ROSTER_KEY) ?? ""}|${JSON.stringify(
      loadTabGroupLabels(),
    )}|${familiarIntroDismissed()}`;
  } catch {
    return "";
  }
}

/** Mascots whose Familiar name is shorter than the mascot's. */
const FAMILIAR_NAME: Record<string, string> = { mushroom: "Shroom" };

/** The name a Familiar goes by until the user names it: "FamiliarCrab", "FamiliarShroom". */
export function defaultFamiliarName(mascot: string): string {
  return `Familiar${FAMILIAR_NAME[mascot] ?? mascot.charAt(0).toUpperCase() + mascot.slice(1)}`;
}

/** One project a Familiar works on, as the rail labels it. */
export type FamiliarProject = { path: string; name: string };

export type FamiliarLook = {
  /** The user's name for it, or its default: "FamiliarInvader", "FamiliarGhost". */
  name: string;
  mascot: string;
  color: string;
  projects: FamiliarProject[];
};

/** How a Familiar looks, and the projects it works on by their rail labels. */
export function familiarLook(familiar: Familiar): FamiliarLook {
  const labels = loadTabGroupLabels();
  return {
    name: familiar.name?.trim() || defaultFamiliarName(familiar.mascot),
    mascot: familiar.mascot,
    color: familiar.color,
    projects: familiar.projects.map((path) => ({
      path,
      name: resolveTabGroupLabel(projectKey(path), labels, projectName(path)),
    })),
  };
}

/** Its projects as a phrase: "app", "app and site", "app, site and api". */
export function familiarProjectsPhrase(projects: readonly FamiliarProject[]): string {
  const names = projects.map((project) => project.name);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Plain one-line take on a step's title, for the Familiar's status. */
function plainLine(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:#{1,6}|>)\s*/gm, "")
    .replace(/[`*_]/g, "")
    .replace(/^\s*[-\d.]+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** What the agent is doing right now, as the Familiars roster shows it. */
export type FamiliarStatus = "working" | "needs-you" | "idle";

export type FamiliarState = {
  status: FamiliarStatus;
  /** Short present-tense note while working or waiting. */
  activity?: string;
};

export const FAMILIAR_STATUS_LABEL: Record<FamiliarStatus, string> = {
  working: "Working",
  "needs-you": "Needs you",
  idle: "Idle",
};

/** The agent's state, with the step it is on or the call it is waiting for. */
export function familiarState(
  session: Pick<
    Session,
    "blocks" | "busy" | "pendingQuestion" | "worktreeRemoved" | "usageLimit"
  >,
): FamiliarState {
  const { blocks, pendingQuestion: question } = session;
  if (!session.worktreeRemoved && question) {
    return {
      status: "needs-you",
      activity: question.title?.trim() || question.questions[0]?.prompt.trim(),
    };
  }
  if (!session.worktreeRemoved && hasPendingApproval(blocks)) {
    const approval = latest(
      blocks,
      (block) => !!block.approval && !block.approval.decided,
    );
    return {
      status: "needs-you",
      activity: approval?.tool?.title
        ? `Approve ${plainLine(approval.tool.title)}`
        : "Waiting for approval",
    };
  }
  if (!session.worktreeRemoved && session.usageLimit) {
    return { status: "needs-you", activity: "Usage limit reached" };
  }
  if (!session.busy) return { status: "idle" };
  const last = blocks[blocks.length - 1];
  if (last?.role === "assistant" && !last.tool && last.streaming) {
    return { status: "working", activity: "Writing a reply" };
  }
  // Only a step from the current turn says what it is doing now.
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.role === "user") break;
    if (block.tool?.title) {
      return { status: "working", activity: plainLine(block.tool.title) };
    }
  }
  return { status: "working", activity: "Thinking" };
}

function latest(
  blocks: readonly Block[],
  match: (block: Block) => boolean,
): Block | undefined {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (match(blocks[i])) return blocks[i];
  }
  return undefined;
}
