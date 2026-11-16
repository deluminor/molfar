export type ConfluenceSpace = {
  id: string;
  key: string;
  name: string;
};

export type ConfluenceKind =
  | "page"
  | "folder"
  | "whiteboard"
  | "database"
  | "embed"
  | "blogpost"
  | "other";

export type ConfluenceNode = {
  id: string;
  title: string;
  kind: ConfluenceKind;
  spaceId: string;
  spaceKey: string;
  parentId: string;
  url: string;
  hasChildren: boolean;
  readable: boolean;
};

export type ConfluencePage = {
  id: string;
  title: string;
  kind: ConfluenceKind;
  spaceId: string;
  spaceKey: string;
  parentId: string;
  url: string;
  body: string;
  readable: boolean;
  truncated: boolean;
};

export type ConfluenceMentionKind = "page" | "folder";

export type ConfluenceMentionRef = {
  kind: ConfluenceMentionKind;
  id: string;
  title: string;
  url: string;
  spaceKey?: string;
};

export type ConfluenceChatCard = {
  kind: ConfluenceMentionKind;
  id: string;
  title: string;
  url: string;
  body: string;
};
