import { useState, type ChangeEvent } from "react";
import { OverlayNav } from "../../../app/shell/TitleBar";
import { WindowControls } from "../../../app/shell/WindowControls";
import { IS_MAC } from "../../../platform/tauri/platform";
import { FolderTree, RefreshCw, Search } from "../../../shared/ui/icons";
import { ModalPanel } from "../../../shared/ui/Modal";
import { useVault } from "../hooks/vault/use-vault";
import { useVaultDocument } from "../hooks/documents/use-vault-document";
import { KnowledgeStatus } from "./KnowledgeStatus";
import { useKnowledgeContext } from "../hooks/documents/use-knowledge-context";
import { KnowledgeGraph } from "./graph/KnowledgeGraph";
import { useKnowledgeProjection } from "../hooks/graph/use-knowledge-projection";
import { KnowledgeSidePanel } from "./side-panel/KnowledgeSidePanel";
import { NO_NOTES } from "./constants";
import { KnowledgeConnect } from "./connect/KnowledgeConnect";
import { KnowledgeTree } from "./tree/KnowledgeTree";
import { KnowledgeAttachment } from "./document/KnowledgeAttachment";
import { KnowledgeDocument } from "./document/KnowledgeDocument";
import type { KnowledgeViewProps, PendingExit } from "./types";
import "./knowledge.css";
import "./document/document.css";
import "./connect/connect.css";

export function KnowledgeView({
  onClose,
  onToggleSidebar,
  besideRail = false,
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
    <div className="knowledge-view" data-beside-rail={besideRail}>
      <header className="knowledge-titlebar" data-tauri-drag-region="deep">
        <OverlayNav onBack={close} onToggleSidebar={onToggleSidebar} />
        <FolderTree size={15} />
        <strong>Knowledge</strong>
        <span className="knowledge-titlebar-context">
          {vault.connection?.name ?? "Connect your vault"}
        </span>
        {!IS_MAC && <WindowControls />}
      </header>
      {vault.error && (
        <div className="knowledge-error" role="alert">
          {vault.error}
        </div>
      )}
      {context.error && (
        <div className="knowledge-error" role="alert">
          {context.error}
        </div>
      )}
      {!vault.connection && (
        <KnowledgeConnect busy={vault.busy} onConnect={vault.connect} />
      )}
      {vault.connection && (
        <>
          <div className="knowledge-toolbar">
            <button
              className="knowledge-icon-button"
              aria-label="Toggle vault tree"
              aria-pressed={treeOpen}
              onClick={toggleTree}
            >
              <FolderTree size={16} />
            </button>
            <label className="knowledge-search">
              <Search size={14} />
              <input
                aria-label="Search vault"
                placeholder="Find notes and files…"
                value={query}
                onChange={changeQuery}
              />
            </label>
            <span className="knowledge-count">
              {vault.snapshot?.notes.length.toLocaleString() ?? "…"} notes
            </span>
            <button
              className="knowledge-icon-button"
              aria-label="Refresh vault"
              onClick={vault.refresh}
              disabled={vault.busy}
            >
              <RefreshCw size={15} />
            </button>
            <button
              className="knowledge-button"
              disabled={vault.busy}
              onClick={disconnect}
            >
              Disconnect
            </button>
          </div>
          <div
            className="knowledge-workspace"
            data-document-open={Boolean(selectedPath)}
          >
            {treeOpen && (
              <aside className="knowledge-files">
                <div className="knowledge-files-heading">
                  <span className="knowledge-eyebrow">VAULT EXPLORER</span>
                  <span title={vault.connection.root}>
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
            )}
            <main className="knowledge-scene">
              <KnowledgeGraph
                projection={graph.projection}
                neighborsOnly={graph.neighborsOnly}
                onToggleNeighborhood={graph.toggleNeighborhood}
                selectedPath={selectedPath}
                onSelect={select}
              />
              <div className="knowledge-scene-caption">
                <span>Explore connections</span>
                <span>Drag to orbit · Scroll to zoom · Select a note</span>
              </div>
            </main>
            {selectedPath && (
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
            )}
          </div>
          <KnowledgeStatus
            vault={vault}
            graph={graph.projection}
            hasDirty={document.hasDirty}
          />
        </>
      )}
      {pendingExit && (
        <ModalPanel
          title={
            pendingExit === "disconnect"
              ? "Disconnect vault?"
              : "Keep drafts and leave?"
          }
          onClose={cancelExit}
          size="sm"
        >
          <p className="knowledge-confirm-copy">
            {pendingExit === "disconnect"
              ? "Unsaved drafts will be discarded. Your vault files will stay unchanged."
              : "Your unsaved drafts will remain available when you return to Knowledge."}
          </p>
          <div className="knowledge-confirm-actions">
            <button className="knowledge-button" onClick={cancelExit}>
              Stay
            </button>
            <button
              className="knowledge-button knowledge-primary"
              onClick={confirmExit}
            >
              {pendingExit === "disconnect"
                ? "Discard drafts and disconnect"
                : "Keep drafts and leave"}
            </button>
          </div>
        </ModalPanel>
      )}
    </div>
  );
}
