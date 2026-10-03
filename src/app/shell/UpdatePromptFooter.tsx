import type { UpdaterSnapshot } from "../model/updater";
import { Loader } from "../../shared/ui/icons";

type Props = {
  snapshot: UpdaterSnapshot | null;
  onLater: () => void;
  onInstall: () => void;
};

export function UpdatePromptFooter({ snapshot, onLater, onInstall }: Props) {
  const downloading = snapshot?.phase === "downloading";
  const error = snapshot?.phase === "error" ? snapshot.error : undefined;

  return (
    <div className="flex items-center gap-3 text-[13px]">
      <div className="min-w-0 flex-1">
        {downloading ? <DownloadProgress progress={snapshot.progress} /> : null}
        {error ? (
          <p role="alert" className="break-words text-[12.5px] text-red-400">
            Couldn't install the update. {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={downloading}
        onClick={onLater}
        className="rounded-md px-3 py-1.5 hover:bg-content/8 disabled:opacity-40 active:scale-[0.97]"
      >
        Later
      </button>
      <button
        type="button"
        disabled={downloading}
        onClick={onInstall}
        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:brightness-110 disabled:opacity-40 active:scale-[0.97]"
      >
        {downloading ? (
          <Loader className="size-3.5 motion-safe:animate-spin" />
        ) : null}
        Install and restart
      </button>
    </div>
  );
}

function DownloadProgress({ progress }: { progress?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label="Downloading update"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="h-1 w-full max-w-40 overflow-hidden rounded-full bg-content/10"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${progress ?? 0}%` }}
        />
      </div>
      <span className="shrink-0 text-[12px] tabular-nums text-content/60">
        {progress != null ? `${progress}%` : "Downloading…"}
      </span>
    </div>
  );
}
