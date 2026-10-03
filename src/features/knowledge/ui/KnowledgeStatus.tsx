import { LoaderCircle } from "../../../shared/ui/icons";
import { SecondaryButton } from "../../../shared/ui/SecondaryButton";
import type { KnowledgeStatusProps } from "./types";

export function KnowledgeStatus({
  vault,
  graph,
  hasDirty,
}: KnowledgeStatusProps) {
  return (
    <footer className="flex max-h-16 flex-wrap items-center gap-x-3 gap-y-1 overflow-auto border-t border-stroke px-4 py-1.5 text-[11px] text-content/50">
      {vault.scanBusy ? (
        <LoaderCircle
          className="size-3 shrink-0 text-accent motion-safe:animate-spin"
          strokeWidth={1.75}
          aria-label="Scanning vault"
        />
      ) : null}
      <span className="text-accent">
        {vault.scanBusy
          ? `Indexing · ${vault.progress.toLocaleString()} files`
          : "Local vault connected"}
      </span>
      {vault.scanBusy ? (
        <SecondaryButton onClick={vault.cancel}>Cancel scan</SecondaryButton>
      ) : null}
      {hasDirty ? <span>Unsaved drafts retained</span> : null}
      <span aria-live="polite">
        {graph.nodes.length.toLocaleString()} / {graph.total.toLocaleString()}{" "}
        notes · {graph.links.length.toLocaleString()} connections
        {graph.missing > 0 ? ` · ${graph.missing} unresolved` : ""}
        {graph.ambiguous > 0 ? ` · ${graph.ambiguous} ambiguous` : ""}
      </span>
      <span className="knowledge-status-refresh">
        {vault.snapshot?.entries.length.toLocaleString() ?? 0} files · Refreshes
        every 30 seconds while visible
      </span>
      {vault.snapshot?.truncated ? <span>Index limit reached</span> : null}
      {vault.snapshot?.warnings.map((warning) => (
        <span
          key={warning}
          className="min-w-0 flex-[1_1_100%] truncate text-content/55"
          title={warning}
        >
          {warning}
        </span>
      ))}
    </footer>
  );
}
