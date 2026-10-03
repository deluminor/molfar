export interface VaultConnection {
  id: string;
  root: string;
  name: string;
}

export interface VaultEntry {
  path: string;
  name: string;
  isDir: boolean;
  isMarkdown: boolean;
}

export interface VaultLink {
  target: string;
  kind: "wiki" | "markdown";
}

export interface VaultNote {
  path: string;
  title: string;
  aliases: string[];
  tags: string[];
  links: VaultLink[];
}

export interface VaultSnapshot {
  connection: VaultConnection;
  entries: VaultEntry[];
  notes: VaultNote[];
  warnings: string[];
  truncated: boolean;
}

export interface VaultDocument {
  path: string;
  body: string;
  revision: string;
}
