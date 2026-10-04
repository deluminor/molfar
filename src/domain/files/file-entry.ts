export type FsEntry = {
  name: string;
  path: string;
  isDir: boolean;
  ignored: boolean;
};

export type ProjectFile = {
  name: string;
  path: string;
  relative: string;
  isDir?: boolean;
};

export type FileMtime = {
  path: string;
  mtimeMs: number | null;
};
