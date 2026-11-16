import type { ConfluenceNode } from "@/features/confluence/model/types";

export type TreeState = {
  loading: boolean;
  error: string | null;
  children: ConfluenceNode[];
};

export type ConfluenceTree = Record<string, TreeState>;

export type SelectedKind = "page" | "folder" | "other";

export type ChildrenQuery = {
  spaceId?: string;
  parentId?: string;
  spaceKey?: string;
  parentKind?: string;
  force?: boolean;
};

export type SetError = (error: string | null) => void;
