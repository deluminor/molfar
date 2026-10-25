import {
  type SessionSync,
  type SessionSyncResponse,
  type SessionSyncChunk,
  type HostSession,
  applySessionSync,
} from "@/domain/remote/protocol";
import { remoteRequest } from "./remote-request";
import { withRemoteAttachmentPreviews } from "./attachment-previews";

/** Reads one sync, assembling it from bounded pieces when the host chunks it. */
async function syncRemoteSession(
  machineId: string,
  sessionId: string,
  revision?: number,
): Promise<SessionSync> {
  const response = await remoteRequest<SessionSyncResponse>(
    machineId,
    "sessions.sync",
    { sessionId, revision },
  );
  if (response.kind !== "chunked") return response;
  const pieces: string[] = [];
  let offset = 0;
  while (offset < response.length) {
    const { data } = await remoteRequest<SessionSyncChunk>(
      machineId,
      "sessions.syncChunk",
      { sessionId, transfer: response.transfer, offset },
    );
    if (!data) throw new Error("Session transfer ended early");
    pieces.push(data);
    offset += data.length;
  }
  if (offset !== response.length)
    throw new Error("Session transfer has an unexpected length");
  return JSON.parse(pieces.join("")) as SessionSync;
}

/** Fetches only what changed since `known`; falls back to a full snapshot. */
export async function loadRemoteSession(
  machineId: string,
  sessionId: string,
  known?: HostSession,
): Promise<HostSession> {
  const sync = (revision?: number) =>
    syncRemoteSession(machineId, sessionId, revision);
  const update = await sync(known?.revision);
  let snapshot: HostSession;
  try {
    snapshot = applySessionSync(known, update);
  } catch {
    snapshot = applySessionSync(undefined, await sync());
  }
  return withRemoteAttachmentPreviews(machineId, snapshot, known, (params) =>
    remoteRequest(machineId, "attachments.read", params),
  );
}
