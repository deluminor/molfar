import type { Familiar } from "../../familiars/model/familiar";
import type { Note } from "../../notes/notes";
import {
  RUNTIME_MODES,
  type Attachment,
  type RuntimeMode,
  type Session,
} from "../../sessions/model/session";
import type { UserQuestionReply } from "../../sessions/model/userQuestion";
import {
  companionFamiliar,
  companionProjects,
  companionSession,
  companionTranscript,
  sortSessions,
  TRANSCRIPT_LIMIT_DEFAULT,
  TRANSCRIPT_LIMIT_MAX,
} from "./companionView";
import {
  COMPANION_PROTOCOL_VERSION,
  type CompanionImage,
  type CompanionNoteSummary,
  type CompanionOverview,
  type CompanionTranscript,
  type CompanionUnchanged,
} from "./protocol";

/** What the executor needs from the running app. App.tsx supplies the live versions. */
export type CompanionDeps = {
  sessions: () => readonly Session[];
  familiars: () => readonly Familiar[];
  /** Rail projects, in rail order. */
  projects: () => readonly string[];
  projectLabel?: (path: string) => string;
  /** Finished turns the user has not looked at, by session ID. */
  unseen: () => ReadonlySet<string>;
  /** Load (creating when needed) a Familiar's conversation without showing it. */
  openFamiliar: (familiarId: string) => Promise<Session | undefined>;
  /** Load a saved session into memory without showing it. */
  openSession: (sessionId: string) => Promise<Session | undefined>;
  submit: (sessionId: string, text: string, attachments: Attachment[]) => boolean;
  stop: (sessionId: string) => void;
  setRuntimeMode: (sessionId: string, mode: RuntimeMode) => void;
  approve: (sessionId: string, requestId: number, decision: "allow" | "deny") => void;
  answer: (sessionId: string, requestId: number, reply: UserQuestionReply) => void;
  notes: {
    list: () => Promise<Note[]>;
    read: (id: string) => Promise<Note | null>;
    create: (input: { title?: string; body: string; tags?: string[] }) => Promise<Note>;
  };
  newId?: () => string;
};

const TEXT_MAX = 64_000;
const IMAGES_MAX = 6;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
// Base64 inflates by 4/3; this keeps one photo under the desktop's 20 MiB cap.
const IMAGE_BASE64_MAX = 14_000_000;

export class CompanionError extends Error {}

function record(value: unknown, name = "input"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CompanionError(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function id(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value || value.length > 200)
    throw new CompanionError(`${key} is required`);
  return value;
}

function limitOf(input: Record<string, unknown>): number {
  const value = input.limit ?? TRANSCRIPT_LIMIT_DEFAULT;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > TRANSCRIPT_LIMIT_MAX)
    throw new CompanionError(`limit must be an integer from 1 to ${TRANSCRIPT_LIMIT_MAX}`);
  return value as number;
}

function requestNumber(input: Record<string, unknown>): number {
  const value = input.requestId;
  if (!Number.isInteger(value)) throw new CompanionError("requestId must be an integer");
  return value as number;
}

export function parseImages(
  value: unknown,
  newId: () => string,
): Attachment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > IMAGES_MAX)
    throw new CompanionError(`images must be a list of at most ${IMAGES_MAX}`);
  return value.map((raw, index) => {
    const image = record(raw, `images[${index}]`) as Partial<CompanionImage>;
    if (typeof image.mimeType !== "string" || !IMAGE_MIMES.has(image.mimeType))
      throw new CompanionError("Only JPEG, PNG, WebP and GIF images are supported");
    if (
      typeof image.data !== "string" ||
      !image.data ||
      image.data.length > IMAGE_BASE64_MAX ||
      !/^[A-Za-z0-9+/]+=*$/.test(image.data)
    )
      throw new CompanionError("Image data must be base64 under 10 MB");
    const name =
      typeof image.name === "string" && image.name.trim()
        ? image.name.trim().slice(0, 120)
        : `photo-${index + 1}.${image.mimeType.split("/")[1]}`;
    return {
      id: newId(),
      name,
      mimeType: image.mimeType,
      kind: "image" as const,
      size: Math.floor((image.data.length * 3) / 4),
      data: image.data,
    };
  });
}

function messageText(input: Record<string, unknown>, hasImages: boolean): string {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (text.length > TEXT_MAX)
    throw new CompanionError(`text must be under ${TEXT_MAX} characters`);
  if (!text && !hasImages) throw new CompanionError("Write something or attach a photo");
  return text;
}

function noteSummary(note: Note): CompanionNoteSummary {
  return {
    id: note.id,
    title: note.title,
    preview: note.body.replace(/\s+/g, " ").trim().slice(0, 200),
    tags: note.tags,
    updatedAt: note.updatedAt,
  };
}

function transcriptOrUnchanged(
  session: Session,
  input: Record<string, unknown>,
): CompanionTranscript | CompanionUnchanged {
  const transcript = companionTranscript(session, limitOf(input));
  if (typeof input.ifRevision === "string" && input.ifRevision === transcript.revision)
    return { unchanged: true, revision: transcript.revision };
  return transcript;
}

export function createCompanionExecutor(deps: CompanionDeps) {
  const newId = deps.newId ?? (() => crypto.randomUUID());

  const live = (sessionId: string) =>
    deps.sessions().find((session) => session.id === sessionId);

  /** Project sessions only: Familiars are reached by their own ID. */
  const projectSession = async (sessionId: string): Promise<Session> => {
    const session = live(sessionId) ?? (await deps.openSession(sessionId));
    if (!session || session.ephemeral || session.orchestrationLeadId || session.inboxAsk)
      throw new CompanionError("Session not found");
    return session;
  };

  const familiarSession = async (familiarId: string): Promise<Session> => {
    if (!deps.familiars().some((familiar) => familiar.id === familiarId))
      throw new CompanionError("Familiar not found");
    const session = await deps.openFamiliar(familiarId);
    if (!session) throw new CompanionError("This Familiar's conversation is unavailable");
    return session;
  };

  /** Any session the user could answer from the desktop, Familiars included. */
  const answerable = async (sessionId: string): Promise<Session> => {
    const familiar = deps.familiars().find((entry) => entry.sessionId === sessionId);
    if (familiar) return familiarSession(familiar.id);
    return projectSession(sessionId);
  };

  const send = (session: Session, input: Record<string, unknown>) => {
    if (session.worktreeRemoved)
      throw new CompanionError("Choose a working copy on the desktop first");
    const attachments = parseImages(input.images, newId);
    const text = messageText(input, attachments.length > 0);
    if (!deps.submit(session.id, text, attachments))
      throw new CompanionError("MOLFAR could not send this message now. Try again shortly.");
    return { sent: true };
  };

  const overview = (): CompanionOverview => {
    const sessions = deps.sessions();
    const unseen = deps.unseen();
    const familiarSessionIds = new Set(
      deps.familiars().flatMap((familiar) => (familiar.sessionId ? [familiar.sessionId] : [])),
    );
    const projectSessions = sortSessions(
      sessions
        .filter(
          (session) =>
            !familiarSessionIds.has(session.id) &&
            !session.ephemeral &&
            !session.orchestrationLeadId &&
            !session.inboxAsk,
        )
        .map((session) => companionSession(session, deps.projectLabel)),
    );
    return {
      protocol: COMPANION_PROTOCOL_VERSION,
      generatedAt: Date.now(),
      familiars: deps.familiars().map((familiar) => {
        const session = familiar.sessionId ? live(familiar.sessionId) : undefined;
        return companionFamiliar(
          familiar,
          session,
          !!familiar.sessionId && unseen.has(familiar.sessionId),
        );
      }),
      projects: companionProjects(deps.projects(), projectSessions, deps.projectLabel),
      sessions: projectSessions,
    };
  };

  return async function handle(action: string, rawInput: unknown): Promise<unknown> {
    const input = record(rawInput ?? {});
    switch (action) {
      case "overview":
        return overview();
      case "familiar.transcript":
        return transcriptOrUnchanged(await familiarSession(id(input, "familiarId")), input);
      case "familiar.send":
        return send(await familiarSession(id(input, "familiarId")), input);
      case "session.transcript":
        return transcriptOrUnchanged(await projectSession(id(input, "sessionId")), input);
      case "session.send":
        return send(await projectSession(id(input, "sessionId")), input);
      case "session.stop": {
        const session = await answerable(id(input, "sessionId"));
        deps.stop(session.id);
        return { stopped: true };
      }
      case "session.mode": {
        const session = await answerable(id(input, "sessionId"));
        const mode = input.runtimeMode;
        if (!RUNTIME_MODES.includes(mode as RuntimeMode))
          throw new CompanionError(`runtimeMode must be one of ${RUNTIME_MODES.join(", ")}`);
        deps.setRuntimeMode(session.id, mode as RuntimeMode);
        return { runtimeMode: mode };
      }
      case "approval.respond": {
        const session = await answerable(id(input, "sessionId"));
        const requestId = requestNumber(input);
        if (input.decision !== "allow" && input.decision !== "deny")
          throw new CompanionError('decision must be "allow" or "deny"');
        const pending = session.blocks.some(
          (block) => block.approval?.requestId === requestId && !block.approval.decided,
        );
        if (!pending) throw new CompanionError("This approval was already answered");
        deps.approve(session.id, requestId, input.decision);
        return { answered: true };
      }
      case "question.answer": {
        const session = await answerable(id(input, "sessionId"));
        const requestId = requestNumber(input);
        if (session.pendingQuestion?.requestId !== requestId)
          throw new CompanionError("This question was already answered");
        const reply = record(input.reply, "reply");
        if (reply.kind !== "answered" && reply.kind !== "skipped")
          throw new CompanionError('reply.kind must be "answered" or "skipped"');
        deps.answer(session.id, requestId, reply as UserQuestionReply);
        return { answered: true };
      }
      case "notes.list": {
        const query =
          typeof input.query === "string" ? input.query.trim().toLowerCase() : "";
        const notes = await deps.notes.list();
        return notes
          .filter(
            (note) =>
              !query ||
              note.title.toLowerCase().includes(query) ||
              note.body.toLowerCase().includes(query) ||
              note.tags.some((tag) => tag.includes(query)),
          )
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 200)
          .map(noteSummary);
      }
      case "notes.read": {
        const note = await deps.notes.read(id(input, "id"));
        if (!note) throw new CompanionError("Note not found");
        return note;
      }
      case "notes.create": {
        const body = typeof input.body === "string" ? input.body : "";
        if (!body.trim() || body.length > 1_000_000)
          throw new CompanionError("body must be non-empty text");
        const tags = Array.isArray(input.tags)
          ? input.tags.filter((tag): tag is string => typeof tag === "string")
          : undefined;
        const title =
          typeof input.title === "string" && input.title.trim()
            ? input.title.trim()
            : undefined;
        return deps.notes.create({ title, body, tags });
      }
      default:
        throw new CompanionError(`Unknown action: ${action}`);
    }
  };
}
