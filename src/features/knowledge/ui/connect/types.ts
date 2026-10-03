export type KnowledgeConnectProps = {
  busy: boolean;
  onConnect: (path: string) => Promise<void>;
};
