import { LoaderCircle } from "../../../shared/ui/icons";
import type { KnowledgeStatusProps } from "./types";

export function KnowledgeStatus({
  vault,
  graph,
  hasDirty,
}: KnowledgeStatusProps) {
  return (
    <footer className="knowledge-status">
      {vault.scanBusy && (
        <LoaderCircle
          size={12}
          className="knowledge-scan-spinner"
          aria-label="Scanning vault"
        />
      )}
      <span className="knowledge-status-state">
        {vault.scanBusy
          ? `Indexing · ${vault.progress.toLocaleString()} files`
          : "Local vault connected"}
      </span>
      {vault.scanBusy && (
        <button className="knowledge-button" onClick={vault.cancel}>
          Cancel scan
        </button>
      )}
      {hasDirty && <span>Unsaved drafts retained</span>}
      <span aria-live="polite">
        {graph.nodes.length.toLocaleString()} / {graph.total.toLocaleString()}{" "}
        notes · {graph.links.length.toLocaleString()} connections
        {graph.missing > 0 && ` · ${graph.missing} unresolved`}
        {graph.ambiguous > 0 && ` · ${graph.ambiguous} ambiguous`}
      </span>
      <span className="knowledge-status-refresh">
        {vault.snapshot?.entries.length.toLocaleString() ?? 0} files · Refreshes
        every 30 seconds while visible
      </span>
      {vault.snapshot?.truncated && <span>Index limit reached</span>}
      {vault.snapshot?.warnings.map((warning) => (
        <span
          key={warning}
          className="knowledge-status-warning"
          title={warning}
        >
          {warning}
        </span>
      ))}
    </footer>
  );
}
