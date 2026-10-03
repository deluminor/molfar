// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import {
  composeNoteMessage,
  noteCardMeta,
  ADD_NOTE_TO_CHAT_EVENT,
} from "@/features/notes/notes";
import {
  knowledgeContextCard,
  requestKnowledgeContext,
} from "./knowledge-context";
import { MAX_KNOWLEDGE_CONTEXT_BYTES } from "./constants";

const connection = { id: "connection-1", root: "/vault", name: "My vault" };
const document = {
  path: "Projects/Guide.md",
  body: "# Guide\nUseful content",
  revision: "sha",
};

it("passes a saved snapshot through the real Notes prompt contract with provenance", () => {
  const card = knowledgeContextCard(connection, document);
  expect(card.sourceCwd).toBeUndefined();
  expect(composeNoteMessage(card, "Explain")).toContain(
    'Knowledge source: {"vault":"My vault","path":"Projects/Guide.md","revision":"sha"}',
  );
  expect(composeNoteMessage(card, "Explain")).toContain(document.body);
  expect(noteCardMeta(card).source).toEqual(card.source);
  const listener = vi.fn();
  window.addEventListener(ADD_NOTE_TO_CHAT_EVENT, listener);
  requestKnowledgeContext(connection, document);
  expect(listener).toHaveBeenCalledOnce();
  window.removeEventListener(ADD_NOTE_TO_CHAT_EVENT, listener);
});

it("rejects empty, unsaved and oversized context using UTF-8 bytes", () => {
  expect(() =>
    knowledgeContextCard(connection, { ...document, body: " " }),
  ).toThrow("empty");
  expect(() =>
    knowledgeContextCard(connection, { ...document, revision: "" }),
  ).toThrow("revision");
  expect(() =>
    knowledgeContextCard(connection, {
      ...document,
      body: "é".repeat(MAX_KNOWLEDGE_CONTEXT_BYTES),
    }),
  ).toThrow("128 KiB");
});
