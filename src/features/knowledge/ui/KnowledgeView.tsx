import { useState, type ChangeEvent } from "react";
import { SurfaceHeader } from "../../home/ui/SurfaceHeader";
import { FolderTree, RefreshCw, Search } from "../../../shared/ui/icons";
import { ModalPanel } from "../../../shared/ui/Modal";
import { SecondaryButton } from "../../../shared/ui/SecondaryButton";
import { useVault } from "../hooks/vault/use-vault";
import { useVaultDocument } from "../hooks/documents/use-vault-document";
import { KnowledgeStatus } from "./KnowledgeStatus";
import { useKnowledgeContext } from "../hooks/documents/use-knowledge-context";
import { KnowledgeGraph } from "./graph/KnowledgeGraph";
import { useKnowledgeProjection } from "../hooks/graph/use-knowledge-projection";
import { KnowledgeSidePanel } from "./side-panel/KnowledgeSidePanel";
import { ACTION_FILLED, ICON_BUTTON, NO_NOTES } from "./constants";
import { KnowledgeAlert } from "./KnowledgeAlert";
import { KnowledgeConnect } from "./connect/KnowledgeConnect";
import { KnowledgeTree } from "./tree/KnowledgeTree";
import { KnowledgeAttachment } from "./document/KnowledgeAttachment";
import { KnowledgeDocument } from "./document/KnowledgeDocument";
import type { KnowledgeViewProps, PendingExit } from "./types";
import "./knowledge.css";
import "./document/document.css";

export function KnowledgeView({
  onClose,
  onToggleSidebar,
  besideRail = false,
  compactRail = false,
}: KnowledgeViewProps) {
  const vault = useVault();
  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [treeOpen, setTreeOpen] = useState(true);
  const [pendingExit, setPendingExit] = useState<PendingExit>(null);
  const markdown = Boolean(
    vault.snapshot?.entries.find((entry) => entry.path === selectedPath)
      ?.isMarkdown,
  );
  const document = useVaultDocument(
    vault.connection?.id,
    markdown ? selectedPath : null,
    vault.connection?.root,
    vault.refresh,
    vault.snapshot,
  );
  const notes = vault.snapshot?.notes ?? NO_NOTES;
  const graph = useKnowledgeProjection(notes, selectedPath, query);
  const context = useKnowledgeContext(
    vault.connection,
    selectedPath,
    document.contextDocument,
  );
  const select = (path: string) => {
    setSelectedPath(path);
  };
  const closeNote = () => setSelectedPath(null);
  const changeQuery = (event: ChangeEvent<HTMLInputElement>) =>
    setQuery(event.target.value);
  const toggleTree = () => setTreeOpen((value) => !value);
  const cancelExit = () => setPendingExit(null);
  const close = () => {
    if (document.hasDirty) setPendingExit("close");
    else onClose();
  };
  const disconnect = () => {
    if (document.hasDirty) setPendingExit("disconnect");
    else {
      void vault.disconnect().then((success) => {
        if (success) {
          document.clear();
          setSelectedPath(null);
        }
      });
    }
  };
  const confirmExit = async () => {
    if (pendingExit === "disconnect") {
      if (await vault.disconnect()) {
        document.clear();
        setSelectedPath(null);
      }
    } else onClose();
    setPendingExit(null);
  };

  return (
    <div
      role="region"
      aria-label="Knowledge"
      data-app-knowledge
      className="flex min-h-0 min-w-0 flex-1 flex-col text-content"
    >
      <SurfaceHeader
        title="Knowledge"
        icon={FolderTree}
        besideRail={besideRail}
        compactRail={compactRail}
        onClose={close}
        onToggleSidebar={onToggleSidebar}
      />
      {vault.error ? (
        <KnowledgeAlert>{vault.error}</KnowledgeAlert>
      ) : null}
      {context.error ? (
        <KnowledgeAlert>{context.error}</KnowledgeAlert>
      ) : null}
      {!vault.connection ? (
        <KnowledgeConnect busy={vault.busy} onConnect={vault.connect} />
      ) : null}
      {vault.connection ? (
        <>
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-stroke px-2">
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label="Toggle vault tree"
              aria-pressed={treeOpen}
              onClick={toggleTree}
            >
              <FolderTree className="size-3.5" strokeWidth={1.75} />
            </button>
            <div className="relative flex h-7 min-w-0 flex-1 items-center">
              <Search className="pointer-events-none absolute left-2 size-3 shrink-0 opacity-50" />
              <input
                aria-label="Search vault"
                placeholder="Find notes and files…"
                value={query}
                onChange={changeQuery}
                spellCheck={false}
                autoComplete="off"
                className="h-7 w-full rounded-md bg-transparent pl-7 pr-2 text-[12px] text-content outline-none placeholder:text-content/40 focus-visible:outline-2 focus-visible:outline-accent"
              />
            </div>
            <span className="knowledge-count shrink-0 px-1 text-[11px] tabular-nums text-content/45">
              {vault.snapshot?.notes.length.toLocaleString() ?? "…"} notes
            </span>
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label="Refresh vault"
              onClick={vault.refresh}
              disabled={vault.busy}
            >
              <RefreshCw className="size-3.5" strokeWidth={1.75} />
            </button>
            <SecondaryButton disabled={vault.busy} onClick={disconnect}>
              Disconnect
            </SecondaryButton>
          </div>
          <div
            className="knowledge-workspace"
          >
            {treeOpen ? (
              <aside className="knowledge-files">
                <div className="flex h-9 shrink-0 items-center border-b border-stroke px-3">
                  <span
                    className="min-w-0 truncate text-[12px] text-content"
                    title={vault.connection.root}
                  >
                    {vault.connection.name}
                  </span>
                </div>
                <KnowledgeTree
                  entries={vault.snapshot?.entries ?? []}
                  dirtyPaths={document.dirtyPaths}
                  query={query}
                  selectedPath={selectedPath}
                  onSelect={select}
                />
              </aside>
            ) : null}
            <main className="knowledge-scene">
              <KnowledgeGraph
                projection={graph.projection}
                neighborsOnly={graph.neighborsOnly}
                onToggleNeighborhood={graph.toggleNeighborhood}
                selectedPath={selectedPath}
                onSelect={select}
              />
              <div className="pointer-events-none absolute inset-x-4 bottom-3.5 flex flex-col gap-0.5 text-[10px] text-content/45">
                <span className="text-[12px] text-content/70">
                  Explore connections
                </span>
                <span>Drag to orbit · Scroll to zoom · Select a note</span>
              </div>
            </main>
            {selectedPath ? (
              <KnowledgeSidePanel>
                {markdown ? (
                  <KnowledgeDocument
                    state={document}
                    vaultId={vault.connection.id}
                    path={selectedPath}
                    notes={notes}
                    entries={vault.snapshot?.entries ?? []}
                    onSelect={select}
                    onContext={context.send}
                    contextBusy={context.busy}
                    onClose={closeNote}
                  />
                ) : (
                  <KnowledgeAttachment
                    vaultId={vault.connection.id}
                    path={selectedPath}
                    onClose={closeNote}
                  />
                )}
              </KnowledgeSidePanel>
            ) : null}
          </div>
          <KnowledgeStatus
            vault={vault}
            graph={graph.projection}
            hasDirty={document.hasDirty}
          />
        </>
      ) : null}
      {pendingExit ? (
        <ModalPanel
          title={
            pendingExit === "disconnect"
              ? "Disconnect vault?"
              : "Keep drafts and leave?"
          }
          onClose={cancelExit}
          size="sm"
        >
          <p className="px-4 pb-1 text-[13px] leading-relaxed text-content/70">
            {pendingExit === "disconnect"
              ? "Unsaved drafts will be discarded. Your vault files will stay unchanged."
              : "Your unsaved drafts will remain available when you return to Knowledge."}
          </p>
          <div className="flex justify-end gap-2 px-4 pb-4 pt-3">
            <SecondaryButton onClick={cancelExit}>Stay</SecondaryButton>
            <button
              type="button"
              className={`${ACTION_FILLED} h-6.5`}
              onClick={() => void confirmExit()}
            >
              {pendingExit === "disconnect"
                ? "Discard drafts and disconnect"
                : "Keep drafts and leave"}
            </button>
          </div>
        </ModalPanel>
      ) : null}
    </div>
  );
}
