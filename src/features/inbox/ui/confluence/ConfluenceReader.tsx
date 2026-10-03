import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import { ExternalLink, LoaderCircle } from "../../../../shared/ui/icons";
import { SecondaryButton } from "../../../../shared/ui/SecondaryButton";
import { AgentMarkdown } from "../../../sessions/ui/AgentMarkdown";
import { confluenceFolderTocMarkdown } from "../../model/confluence/prompt";
import type {
  ConfluenceNode,
  ConfluencePage,
  ConfluenceSpace,
} from "../../model/confluence/types";
import type { SelectedKind } from "./types";

type Props = {
  cwd: string;
  activeSpace: ConfluenceSpace | undefined;
  selectedId: string | null;
  selectedKind: SelectedKind;
  page: ConfluencePage | null;
  folderChildren: readonly ConfluenceNode[];
  loadingPage: boolean;
  error: string | null;
  sending: boolean;
  onSendToChat: () => void;
  onCopyMention: () => void;
};

function Placeholder({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="grid flex-1 place-items-center px-6">
      <p className="text-[13px] text-content/45">{children}</p>
    </div>
  );
}

function kindLabel(selectedKind: SelectedKind, page: ConfluencePage): string {
  if (selectedKind === "folder") return "Folder";
  if (page.kind === "page") return "Page";

  return page.kind;
}

function PageBody({
  cwd,
  page,
  selectedKind,
  folderChildren,
}: Pick<Props, "cwd" | "selectedKind" | "folderChildren"> & {
  page: ConfluencePage;
}): ReactNode {
  if (selectedKind !== "folder") {
    return <AgentMarkdown text={page.body} cwd={cwd} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-content/50">
        Folders pass a table of contents to the agent. Individual pages include
        full markdown.
      </p>
      <AgentMarkdown
        text={confluenceFolderTocMarkdown(
          { title: page.title, url: page.url, id: page.id },
          folderChildren,
        )}
        cwd={cwd}
      />
    </div>
  );
}

export function ConfluenceReader({
  cwd,
  activeSpace,
  selectedId,
  selectedKind,
  page,
  folderChildren,
  loadingPage,
  error,
  sending,
  onSendToChat,
  onCopyMention,
}: Props): ReactNode {
  if (!selectedId) {
    return <Placeholder>Select a Confluence page or folder</Placeholder>;
  }

  if (loadingPage && !page) {
    return (
      <div className="grid flex-1 place-items-center text-content/40">
        <LoaderCircle className="size-4 animate-spin" strokeWidth={1.75} />
      </div>
    );
  }

  if (!page) {
    return <Placeholder>{error ?? "Could not load this page"}</Placeholder>;
  }

  return (
    <>
      <div
        className="flex shrink-0 flex-col gap-2 border-b border-stroke px-4 py-3"
        data-inbox-detail-header
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.08em] text-content/40">
              {kindLabel(selectedKind, page)}
              {activeSpace ? ` · ${activeSpace.key}` : ""}
            </p>
            <h2 className="mt-1 text-[15px] font-medium leading-snug text-content">
              {page.title}
            </h2>
          </div>
          <button
            type="button"
            title="Open in Confluence"
            aria-label="Open in Confluence"
            onClick={() => void openUrl(page.url)}
            className="grid size-7 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content"
          >
            <ExternalLink className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SecondaryButton
            type="button"
            disabled={sending}
            onClick={onSendToChat}
          >
            {sending ? "Sending…" : "Send to chat"}
          </SecondaryButton>
          <button
            type="button"
            onClick={onCopyMention}
            className="h-7 rounded-md px-2 text-[12px] text-content/55 hover:bg-content/8 hover:text-content"
          >
            Copy @mention
          </button>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-none px-4 py-4"
        data-inbox-detail-scroll
      >
        <PageBody
          cwd={cwd}
          page={page}
          selectedKind={selectedKind}
          folderChildren={folderChildren}
        />
        {page.truncated ? (
          <p className="mt-4 text-[12px] text-content/45">
            Body truncated for size. Open in Confluence for the full page.
          </p>
        ) : null}
      </div>
    </>
  );
}
