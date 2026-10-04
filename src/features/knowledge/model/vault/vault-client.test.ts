import { beforeEach, expect, it, vi } from "vitest";
import { pickVaultFolder } from "@/features/knowledge/model/vault/vault-client";

const dialog = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => dialog);

beforeEach(() => {
  dialog.open.mockReset();
});

it("chooses one vault while preserving the returned platform path", async () => {
  dialog.open.mockResolvedValue("C:\\Notes\\Vault");
  expect(await pickVaultFolder()).toBe("C:\\Notes\\Vault");
  expect(dialog.open).toHaveBeenCalledExactlyOnceWith({
    directory: true,
    multiple: false,
    title: "Connect Obsidian vault",
  });
});

it("does nothing when the user cancels", async () => {
  dialog.open.mockResolvedValue(null);
  expect(await pickVaultFolder()).toBeNull();
});

it("rejects an unexpected multiple selection and surfaces picker failures", async () => {
  dialog.open.mockResolvedValue(["/one", "/two"]);
  await expect(pickVaultFolder()).rejects.toThrow("exactly one");
  dialog.open.mockRejectedValue(new Error("Dialog unavailable"));
  await expect(pickVaultFolder()).rejects.toThrow("Dialog unavailable");
});
