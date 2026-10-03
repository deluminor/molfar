import { useState, type ChangeEvent, type FormEvent } from "react";
import { pickVaultFolder } from "@/platform/tauri/vault";
import { FolderOpen, FolderTree } from "@/shared/ui/icons";
import { SecondaryButton } from "@/shared/ui/SecondaryButton";
import { ACTION_FILLED } from "../constants";
import type { KnowledgeConnectProps } from "./types";

export function KnowledgeConnect({ busy, onConnect }: KnowledgeConnectProps) {
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const change = (event: ChangeEvent<HTMLInputElement>) =>
    setPath(event.target.value);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (path.trim()) void onConnect(path.trim());
  };
  const choose = async () => {
    try {
      const selected = await pickVaultFolder();
      if (selected) {
        setPath(selected);
        await onConnect(selected);
      }
    } catch (failure: unknown) {
      setError(String(failure));
    }
  };

  return (
    <div className="mx-auto my-auto w-[min(540px,calc(100%-48px))] px-3 py-10">
      <div className="mb-6 grid size-14 place-items-center rounded-2xl border border-stroke bg-content/[0.03] text-accent">
        <FolderTree className="size-7" strokeWidth={1.5} />
      </div>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-content/40">
        Your knowledge, connected
      </p>
      <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight text-content max-[480px]:text-2xl">
        A space for everything you know.
      </h1>
      <p className="mt-3 max-w-[450px] text-[13px] leading-relaxed text-content/60">
        Connect an Obsidian vault. Explore the links between your notes, edit
        Markdown, and bring useful context to your agents.
      </p>
      <button
        type="button"
        className={`${ACTION_FILLED} mt-6 h-8`}
        disabled={busy}
        onClick={() => void choose()}
      >
        <FolderOpen className="size-4" strokeWidth={1.75} /> Choose vault folder
      </button>
      <form className="mt-7" onSubmit={submit}>
        <label
          htmlFor="knowledge-vault-path"
          className="mb-2 block text-[11px] text-content/50"
        >
          Or enter an absolute folder path
        </label>
        <div className="flex gap-2">
          <input
            id="knowledge-vault-path"
            value={path}
            onChange={change}
            placeholder="/Users/you/Documents/My vault"
            autoComplete="off"
            spellCheck={false}
            className="h-8 min-w-0 flex-1 rounded-md border border-stroke bg-content/[0.03] px-3 font-mono text-[11px] text-content outline-none placeholder:text-content/35 focus-visible:outline-2 focus-visible:outline-accent"
          />
          <SecondaryButton type="submit" disabled={busy || !path.trim()}>
            Connect
          </SecondaryButton>
        </div>
      </form>
      <p className="mt-4 text-[11px] text-content/40">
        Your files stay in your vault. Changes save only when you choose Save.
      </p>
      {error ? (
        <p className="mt-3 text-[12px] text-content/70" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
