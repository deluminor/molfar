import { useId, useState, type MouseEvent } from "react";
import {
  formatReleaseDate,
  listWhatsNewReleases,
  releaseNotesTitle,
  type ReleaseNotesEntry,
} from "@/features/updates/model/release-notes";
import { ChevronDown } from "@/shared/ui/icons";
import { ReleaseNotesBody, ReleaseNotesDialog } from "./ReleaseNotesDialog";

type Props = {
  version: string;
  onClose: () => void;
};

function ReleaseAccordion({
  focusVersion,
  releases,
}: {
  focusVersion: string;
  releases: ReleaseNotesEntry[];
}) {
  const baseId = useId();
  const initialOpen = releases.some((entry) => entry.version === focusVersion)
    ? focusVersion
    : (releases[0]?.version ?? focusVersion);
  const [openVersion, setOpenVersion] = useState(initialOpen);

  const onSelectRelease = (event: MouseEvent<HTMLButtonElement>) => {
    const next = event.currentTarget.dataset.version;
    if (next) setOpenVersion(next);
  };

  return (
    <div className="flex flex-col gap-px px-2 py-2" role="list">
      {releases.map((entry) => {
        const open = entry.version === openVersion;
        const panelId = `${baseId}-${entry.version}-panel`;
        const date = entry.date ? formatReleaseDate(entry.date) : null;

        return (
          <section
            key={entry.version}
            role="listitem"
            className={`rounded-xl transition-colors ${
              open ? "bg-content/[0.04]" : "hover:bg-content/[0.03]"
            }`}
          >
            <h3 className="m-0">
              <button
                type="button"
                data-version={entry.version}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={onSelectRelease}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
              >
                <ChevronDown
                  aria-hidden
                  className={`mt-0.5 size-3.5 shrink-0 text-content/35 transition-transform duration-200 motion-reduce:transition-none ${
                    open ? "rotate-0" : "-rotate-90"
                  }`}
                  strokeWidth={1.75}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="text-[13px] font-medium tracking-tight text-content">
                      {entry.version}
                    </span>
                    {date ? (
                      <span className="truncate text-[11px] tabular-nums text-content/40">
                        {date}
                      </span>
                    ) : null}
                  </span>
                  {!open && entry.foreshadow ? (
                    <span className="mt-0.5 block truncate text-[12px] leading-snug text-content/35">
                      {entry.foreshadow}
                    </span>
                  ) : null}
                  {!open && !entry.foreshadow ? (
                    <span
                      aria-hidden
                      className="mt-1.5 block h-2 w-2/3 max-w-[12rem] rounded-sm bg-content/[0.06]"
                    />
                  ) : null}
                </span>
              </button>
            </h3>
            {open ? (
              <div id={panelId} role="region" className="pb-1">
                <ReleaseNotesBody
                  label={releaseNotesTitle(entry.version)}
                  markdown={entry.markdown}
                />
              </div>
            ) : (
              <div id={panelId} hidden />
            )}
          </section>
        );
      })}
    </div>
  );
}

export function WhatsNewBody({ version }: { version: string }) {
  const releases = listWhatsNewReleases(version);

  if (releases.length === 0) {
    return (
      <ReleaseNotesBody
        label={releaseNotesTitle(version)}
        markdown={null}
      />
    );
  }

  return <ReleaseAccordion focusVersion={version} releases={releases} />;
}

export function WhatsNewDialog({ version, onClose }: Props) {
  const focus = listWhatsNewReleases(version).find(
    (entry) => entry.version === version,
  );
  const date = focus?.date ? formatReleaseDate(focus.date) : null;

  return (
    <ReleaseNotesDialog
      title="What's new"
      description={`MOLFAR ${version}${date ? ` · ${date}` : ""}`}
      size="lg"
      className="h-[min(82vh,760px)]"
      onClose={onClose}
    >
      <WhatsNewBody version={version} />
    </ReleaseNotesDialog>
  );
}
