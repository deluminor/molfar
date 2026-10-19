import type { Block } from "@/domain/session/block";
import type { Session } from "@/domain/session/session";

export type FamiliarChatDeps = {
  openSessions(): Session[];
  commitSessions(next: Session[]): void;
  persist(session: Session | undefined): void;
  schedule(run: () => void, ms: number): void;
};

export type FamiliarChat = ReturnType<typeof createFamiliarChat>;

/** Writes to a Familiar's chat outside any turn: habit posts and relayed approvals. */
export function createFamiliarChat(deps: FamiliarChatDeps) {
  /** Adds a block once no reply is streaming. */
  const append = (
    familiarId: string,
    block: Block,
    then?: (familiar: Session) => void,
    attempt = 0,
  ): void => {
    const familiar = deps.openSessions().find((session) => session.id === familiarId);
    if (!familiar) return;
    if (familiar.busy && attempt < 120) {
      deps.schedule(() => append(familiarId, block, then, attempt + 1), 5_000);
      return;
    }

    const next: Session = { ...familiar, blocks: [...familiar.blocks, block] };
    deps.commitSessions(
      deps.openSessions().map((session) => (session.id === familiarId ? next : session)),
    );
    deps.persist(next);
    then?.(next);
  };

  /** Records the answer to an approval relayed into the chat. */
  const decide = (
    familiarId: string,
    blockId: string,
    decided: "allow" | "deny" | "cancelled",
  ): void => {
    const decideIn = (session: Session) =>
      session.id === familiarId
        ? {
            ...session,
            blocks: session.blocks.map((block) =>
              block.id === blockId && block.approval
                ? { ...block, approval: { ...block.approval, decided } }
                : block,
            ),
          }
        : session;
    const next = deps.openSessions().map(decideIn);

    deps.commitSessions(next);
    deps.persist(next.find((session) => session.id === familiarId));
  };

  return { append, decide };
}
