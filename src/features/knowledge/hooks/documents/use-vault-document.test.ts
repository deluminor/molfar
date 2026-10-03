// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useVaultDocument } from "./use-vault-document";
import { retainDrafts } from "./draft-store";
const api = vi.hoisted(() => ({
  readVaultNote: vi.fn(),
  saveVaultNote: vi.fn(),
}));
vi.mock("../../../../platform/tauri/vault", () => api);
let root: Root;
let state: ReturnType<typeof useVaultDocument>;
let path = "one.md";
let refreshToken: import("../../model/vault/types").VaultSnapshot | null = null;
const refresh = vi.fn().mockResolvedValue(undefined);
function Probe() {
  state = useVaultDocument("vault", path, "/test/vault", refresh, refreshToken);
  return null;
}
async function render() {
  await act(async () => {
    root.render(createElement(Probe));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  retainDrafts("/test/vault", {});
  path = "one.md";
  refreshToken = null;
  api.readVaultNote
    .mockReset()
    .mockImplementation(async (_id: string, selected: string) => ({
      path: selected,
      body: "Original",
      revision: "r1",
    }));
  api.saveVaultNote
    .mockReset()
    .mockImplementation(
      async (_id: string, selected: string, body: string) => ({
        path: selected,
        body,
        revision: "r2",
      }),
    );
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
it("keeps the saved CRLF convention when editing textarea text", async () => {
  api.readVaultNote.mockResolvedValue({
    path: "one.md",
    body: "---\r\ncustom: value\r\n---\r\nOriginal\r\n",
    revision: "r1",
  });
  await render();
  await act(async () => state.change("---\ncustom: value\n---\nEdited\n"));
  await act(async () => state.save());
  expect(api.saveVaultNote).toHaveBeenCalledWith(
    "vault",
    "one.md",
    "---\r\ncustom: value\r\n---\r\nEdited\r\n",
    "r1",
  );
});

it("keeps independent drafts when switching notes and remounting", async () => {
  await render();
  await act(async () => state.change("My draft"));
  path = "two.md";
  await render();
  expect(state.draft?.body).toBe("Original");
  path = "one.md";
  await render();
  expect(state.draft?.body).toBe("My draft");
  expect(state.hasDirty).toBe(true);
  await act(async () => root.unmount());
  root = createRoot(document.createElement("div"));
  await render();
  expect(state.draft?.body).toBe("My draft");
});
it("saves with the captured revision and refreshes the index", async () => {
  await render();
  await act(async () => state.change("Edited"));
  await act(async () => state.save());
  expect(api.saveVaultNote).toHaveBeenCalledWith(
    "vault",
    "one.md",
    "Edited",
    "r1",
  );
  expect(state.dirty).toBe(false);
  expect(state.draft?.saved.revision).toBe("r2");
  expect(refresh).toHaveBeenCalled();
});
it("preserves a conflicting draft while loading the external revision", async () => {
  await render();
  await act(async () => state.change("Local draft"));
  api.saveVaultNote.mockRejectedValueOnce(new Error("File changed externally"));
  await act(async () => state.save());
  expect(state.draft?.conflict).toBe(true);
  expect(state.draft?.body).toBe("Local draft");
  api.readVaultNote.mockResolvedValueOnce({
    path: "one.md",
    body: "External version",
    revision: "external",
  });
  await act(async () => state.reload());
  expect(state.draft?.body).toBe("Local draft");
  expect(state.draft?.saved.body).toBe("External version");
  await act(async () => state.discard());
  expect(state.draft?.body).toBe("External version");
});

it("updates a clean note on an external refresh", async () => {
  await render();
  api.readVaultNote.mockResolvedValueOnce({
    path: "one.md",
    body: "External",
    revision: "r3",
  });
  refreshToken = {
    connection: { id: "vault", root: "/test/vault", name: "Vault" },
    entries: [],
    notes: [],
    warnings: [],
    truncated: false,
  };
  await render();
  expect(state.draft?.body).toBe("External");
  expect(state.draft?.saved.revision).toBe("r3");
});
it("marks externally changed dirty notes as conflicts without replacing the draft", async () => {
  await render();
  await act(async () => state.change("Local"));
  api.readVaultNote.mockResolvedValueOnce({
    path: "one.md",
    body: "External",
    revision: "r3",
  });
  refreshToken = {
    connection: { id: "vault", root: "/test/vault", name: "Vault" },
    entries: [],
    notes: [],
    warnings: [],
    truncated: false,
  };
  await render();
  expect(state.draft?.body).toBe("Local");
  expect(state.draft?.conflict).toBe(true);
  expect(state.draft?.saved.revision).toBe("r1");
});
it("reads the current native snapshot before supplying agent context", async () => {
  await render();
  api.readVaultNote.mockResolvedValueOnce({
    path: "one.md",
    body: "Fresh agent context",
    revision: "r4",
  });
  await act(async () => {
    expect((await state.contextDocument()).body).toBe("Fresh agent context");
  });
  expect(state.draft?.saved.revision).toBe("r4");
  await act(async () => state.change("Dirty"));
  await expect(state.contextDocument()).rejects.toThrow(
    "Save or resolve your draft",
  );
});
