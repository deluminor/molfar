import { createElement, type ReactElement } from "react";
import { type Mock, vi } from "vitest";
import {
  type WorkspaceHandlers,
  WorkspaceHandlersContext,
} from "../handlers/workspace-handlers";

type FakeGroup = Record<string, Mock>;

/**
 * Every handler group and method answers with a `vi.fn`, created on first
 * read and kept, so a test asserts on `handlers.files.open` after a click.
 */
export function fakeWorkspaceHandlers(): WorkspaceHandlers {
  const groups = new Map<PropertyKey, FakeGroup | Mock>();
  const group = (): FakeGroup => {
    const fns = new Map<PropertyKey, Mock>();
    return new Proxy<FakeGroup>({}, {
      get: (_, key) => fns.get(key) ?? fns.set(key, vi.fn()).get(key),
    });
  };
  const functionMembers = new Set<PropertyKey>(["prefetchSession", "remoteSnapshot"]);

  return new Proxy({}, {
    get: (_, key) => {
      if (!groups.has(key)) groups.set(key, functionMembers.has(key) ? vi.fn() : group());
      return groups.get(key);
    },
  }) as unknown as WorkspaceHandlers;
}

export function withWorkspaceHandlers(
  element: ReactElement,
  handlers: WorkspaceHandlers = fakeWorkspaceHandlers(),
): ReactElement {
  return createElement(WorkspaceHandlersContext.Provider, { value: handlers }, element);
}
