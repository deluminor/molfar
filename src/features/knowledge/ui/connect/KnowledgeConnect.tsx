import { useState, type ChangeEvent, type FormEvent } from "react";
import { pickVaultFolder } from "../../../../platform/tauri/vault";
import { FolderOpen, FolderTree } from "../../../../shared/ui/icons";
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
    <div className="knowledge-connect">
      <div className="knowledge-connect-mark">
        <FolderTree size={28} />
      </div>
      <span className="knowledge-eyebrow">YOUR KNOWLEDGE, CONNECTED</span>
      <h1>A space for everything you know.</h1>
      <p>
        Connect an Obsidian vault. Explore the links between your notes, edit
        Markdown, and bring useful context to your agents.
      </p>
      <button
        className="knowledge-button knowledge-primary"
        disabled={busy}
        onClick={choose}
      >
        <FolderOpen size={16} /> Choose vault folder
      </button>
      <form onSubmit={submit}>
        <label htmlFor="knowledge-vault-path">
          Or enter an absolute folder path
        </label>
        <div className="knowledge-path-input">
          <input
            id="knowledge-vault-path"
            value={path}
            onChange={change}
            placeholder="/Users/you/Documents/My vault"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            className="knowledge-button"
            disabled={busy || !path.trim()}
            type="submit"
          >
            Connect
          </button>
        </div>
      </form>
      <p className="knowledge-connect-footnote">
        Your files stay in your vault. Changes save only when you choose Save.
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
