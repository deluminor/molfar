// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useKnowledgeContext } from "./use-knowledge-context";
import type { VaultDocument } from "../../model/vault/types";

const request = vi.hoisted(() => vi.fn());
vi.mock("../../model/context/knowledge-context", () => ({
  requestKnowledgeContext: request,
}));
const connection = { id: "vault", root: "/vault", name: "Vault" };
const document = { path: "one.md", body: "Context", revision: "r1" };
let root: Root;
let state: ReturnType<typeof useKnowledgeContext>;
let path: string;
const read = vi.fn<() => Promise<VaultDocument>>();

function Probe() {
  state = useKnowledgeContext(connection, path, read);
  return null;
}
async function render() {
  await act(async () => root.render(createElement(Probe)));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  path = "one.md";
  request.mockReset();
  read.mockReset().mockResolvedValue(document);
  root = createRoot(window.document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("deduplicates repeated clicks while reading the saved note", async () => {
  let resolve!: (value: VaultDocument) => void;
  read.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await render();
  let pending!: Promise<void>;
  await act(async () => {
    pending = state.send();
  });
  expect(state.busy).toBe(true);
  await act(async () => state.send());
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve(document);
    await pending;
  });
  expect(request).toHaveBeenCalledExactlyOnceWith(connection, document);
  expect(state.busy).toBe(false);
});

it("does not dispatch stale context after switching notes", async () => {
  let resolve!: (value: VaultDocument) => void;
  read.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await render();
  let pending!: Promise<void>;
  await act(async () => {
    pending = state.send();
  });
  path = "two.md";
  await render();
  await act(async () => {
    resolve(document);
    await pending;
  });
  expect(request).not.toHaveBeenCalled();
});

it("shows read failures and permits retry", async () => {
  read.mockRejectedValueOnce(new Error("File unavailable"));
  await render();
  await act(async () => state.send());
  expect(state.error).toContain("File unavailable");
  expect(request).not.toHaveBeenCalled();
  await act(async () => state.send());
  expect(request).toHaveBeenCalledExactlyOnceWith(connection, document);
  expect(state.error).toBeNull();
});
