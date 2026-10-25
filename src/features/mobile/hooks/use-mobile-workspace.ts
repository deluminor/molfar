import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { mobileCatalog } from "../model/mobile-catalog";
import { mobileConversation } from "../model/mobile-conversation";
import {
  watchUpdate,
  watchWindow,
  type WatchBaseline,
} from "../model/mobile-watch";
import type { RuntimeMode } from "@/domain/session/runtime-mode";
import type { Session } from "@/domain/session/session";
import { DEFAULT_TAIL, MAX_PAGE } from "../constants";
import { createMobileGitJobs } from "../model/mobile-git-jobs";
import { mobileRead } from "../model/mobile-reads";
import { createMobileReceipts } from "../model/mobile-receipts";

type Request = {
  id: string;
  commandId: string;
  method: string;
  params: Record<string, unknown>;
};
type WatchEvent =
  | {
      id: string;
      action: "start";
      conversationId: string;
      /** How many of the latest turns to open on. */
      tail?: number | null;
      /** The first turn the phone already has, to carry on from instead. */
      from?: string | null;
      incremental?: boolean;
    }
  | { id: string; action: "stop" };
/** At most this often while a reply streams, so the phone gets ~20 frames a second. */
const PUSH_INTERVAL_MS = 50;
type Options = {
  sessions: readonly Session[];
  /** The permission mode a new desktop tab would start with. */
  defaultRuntimeMode?: RuntimeMode;
  command: (
    method: string,
    params: Record<string, unknown>,
    commandId: string,
  ) => Promise<unknown>;
};
export function useMobileWorkspace(options: Options) {
  const current = useRef(options);
  current.current = options;
  const wake = useRef<(() => void) | null>(null);
  /** The sessions a watch on a conversation has read from disk, if one is open. */
  const savedFor = useRef<
    (conversationId: string) => Map<string, Session> | undefined
  >(() => undefined);
  // Every session change, a streamed token included, may be news for a phone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the sessions array is the trigger; the effect only wakes the watch loop
  useEffect(() => wake.current?.(), [options.sessions]);
  useEffect(() => {
    let disposed = false;
    const watches = new Map<
      string,
      {
        conversationId: string;
        baseline: WatchBaseline | null;
        tail: number;
        incremental: boolean;
        /** The first turn the watch carries; the window grows from here. */
        from: string | null;
        /** Sessions read from disk, kept for the watch's lifetime. */
        saved: Map<string, Session>;
      }
    >();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pushing = false;
    let again = false;
    const push = async () => {
      timer = undefined;
      if (pushing) {
        again = true;
        return;
      }
      pushing = true;
      for (const [id, watch] of [...watches]) {
        let frame: ReturnType<typeof watchUpdate>;
        try {
          let older = false;
          const conversation = await mobileConversation(
            watch.conversationId,
            current.current.sessions,
            watch.saved,
            (turnIds) => {
              const window = watchWindow(turnIds, watch.from, watch.tail);
              watch.from = window.from;
              older = window.older;
              return [window.start, turnIds.length];
            },
          );
          frame = watchUpdate(
            watch.baseline,
            {
              busy: conversation.busy,
              older,
              turns: conversation.turns,
            },
            watch.incremental,
          );
        } catch (error) {
          frame = {
            update: {
              error: error instanceof Error ? error.message : String(error),
            },
            baseline: watch.baseline ?? {
              busy: false,
              older: false,
              order: [],
              turns: new Map(),
            },
          };
        }
        if (!frame || disposed || !watches.has(id)) continue;
        try {
          await invoke("mobile_push", { id, update: frame.update });
          watch.baseline = frame.baseline;
        } catch (error) {
          // "busy": the phone is behind; the next push sends from the old baseline.
          if (String(error) === "gone") watches.delete(id);
          else if (String(error) === "busy") again = true;
        }
      }
      pushing = false;
      if (again && !disposed) {
        again = false;
        schedule();
      }
    };
    const schedule = () => {
      if (watches.size > 0 && timer === undefined)
        timer = setTimeout(() => void push(), PUSH_INTERVAL_MS);
    };
    wake.current = schedule;
    savedFor.current = (conversationId) =>
      [...watches.values()].find(
        (watch) => watch.conversationId === conversationId,
      )?.saved;
    const listening = listen<WatchEvent>(
      "molfar-mobile-watch",
      ({ payload }) => {
        if (payload.action === "start") {
          watches.set(payload.id, {
            conversationId: payload.conversationId,
            incremental: payload.incremental === true,
            baseline: null,
            tail: Math.min(MAX_PAGE, Math.max(1, payload.tail ?? DEFAULT_TAIL)),
            from: payload.from ?? null,
            saved: new Map(),
          });
          // The phone waits for its first frame; send it straight away.
          clearTimeout(timer);
          timer = undefined;
          void push();
        } else watches.delete(payload.id);
      },
    );
    return () => {
      disposed = true;
      wake.current = null;
      clearTimeout(timer);
      void listening.then((unlisten) => unlisten());
    };
  }, []);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const runCommand = createMobileReceipts();
    const gitAction = createMobileGitJobs();
    // Publish in order: an older poll must not overwrite the catalog that makes
    // a newly created session routable before its ID is returned to the phone.
    let publication = Promise.resolve();
    const publishCatalog = () => {
      const next = publication.then(async () => {
        if (disposed) return;
        const catalog = await mobileCatalog(
          current.current.sessions,
          current.current.defaultRuntimeMode,
        );
        if (!disposed) await invoke("mobile_publish", { catalog });
      });
      publication = next.catch(() => {});
      return next;
    };
    const publish = async () => {
      try {
        const status = await invoke<{ enabled: boolean }>("mobile_status");
        if (status.enabled && !disposed) await publishCatalog();
      } catch (error) {
        if (!disposed) console.error("Mobile workspace publish failed", error);
      }
      if (!disposed) timer = setTimeout(() => void publish(), 3000);
    };
    const listening = listen<Request>(
      "molfar-mobile-request",
      ({ payload }) => {
        void (async () => {
          let response: unknown;
          try {
            let result: unknown;
            const read = mobileRead(payload.method);
            if (read) {
              result = await read(payload.params, {
                sessions: current.current.sessions,
                defaultRuntimeMode: current.current.defaultRuntimeMode,
                savedFor: savedFor.current,
              });
            } else if (payload.method === "project.gitAction") {
              result = await gitAction(payload.commandId, payload.params);
            } else {
              result = await runCommand(
                current.current.command,
                payload.method,
                payload.params,
                payload.commandId,
              );
            }
            // Conversation reads and watches are routed through the published
            // catalog. Make this session visible there before acknowledging it.
            if (payload.method === "session.start") await publishCatalog();
            response = { ok: true, result };
          } catch (error) {
            response = {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
          await invoke("mobile_reply", { id: payload.id, response }).catch(
            (error) => {
              if (!disposed) console.error("Mobile reply failed", error);
            },
          );
        })();
      },
    );
    void publish();
    return () => {
      disposed = true;
      clearTimeout(timer);
      void listening.then((unlisten) => unlisten());
    };
  }, []);
}
