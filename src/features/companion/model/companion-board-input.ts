import { HARNESSES } from "@/domain/harness/harness";
import { RUNTIME_MODES } from "@/domain/session/runtime-mode";
import { BOARD_COLUMNS } from "@/features/task-board/constants/columns";
import type { OwnerAction } from "@/features/task-board/services/actions";
import type { BoardColumn, DeliveryMethod } from "@/features/task-board/types/card";
import type { StageModelConfig } from "@/features/task-board/types/stage";

/** Errors a phone can branch on: the message starts with `<code>:`. */
export class BoardInputError extends Error {
  constructor(code: "invalid_input" | "not_found" | "conflict" | "illegal_transition" | "needs_input", message: string) {
    super(`${code}: ${message}`);
  }
}

const NOTE_MAX = 20_000;

export function text(input: Record<string, unknown>, name: string, max: number, optional = false): string {
  const value = input[name];
  if (value === undefined && optional) return "";
  if (typeof value !== "string" || value.length > max || (!optional && !value.trim()))
    throw new BoardInputError("invalid_input", `${name} must be text up to ${max} characters`);
  return value;
}

export function cardId(input: Record<string, unknown>, name = "id"): string {
  const value = text(input, name, 128);
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new BoardInputError("invalid_input", `${name} is not an id`);
  return value;
}

export function updatedAt(input: Record<string, unknown>): number {
  const value = input.ifUpdatedAt;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new BoardInputError("invalid_input", "ifUpdatedAt must be the card's updatedAt");
  return value;
}

export function column(value: unknown): BoardColumn {
  const found = BOARD_COLUMNS.find((entry) => entry === value);
  if (!found) throw new BoardInputError("invalid_input", "to must be a board column");
  return found;
}

function stringList(value: unknown, name: string, max: number): string[] {
  const list = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.length <= 64) : [];
  if (!Array.isArray(value) || value.length > max || list.length !== value.length)
    throw new BoardInputError("invalid_input", `${name} must be a list of ids`);
  return list;
}

function answers(value: unknown): { number: number; answer: string }[] {
  if (!Array.isArray(value) || value.length > 50) throw new BoardInputError("invalid_input", "answers must be a list");
  return value.map((entry: unknown) => {
    const raw = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    if (!Number.isInteger(raw.q) || Number(raw.q) < 1 || typeof raw.answer !== "string" || raw.answer.length > NOTE_MAX)
      throw new BoardInputError("invalid_input", "each answer needs q and answer");
    return { number: Number(raw.q), answer: raw.answer };
  });
}

function override(input: Record<string, unknown>): Partial<StageModelConfig> | undefined {
  const config: Partial<StageModelConfig> = {};
  const harness = HARNESSES.find((entry) => entry === input.harness);
  const runtimeMode = RUNTIME_MODES.find((entry) => entry === input.runtimeMode);
  if (input.harness !== undefined && !harness) throw new BoardInputError("invalid_input", "unknown harness");
  if (input.runtimeMode !== undefined && !runtimeMode)
    throw new BoardInputError("invalid_input", `runtimeMode must be one of ${RUNTIME_MODES.join(", ")}`);

  if (harness) config.harness = harness;
  if (typeof input.model === "string") config.model = input.model;
  if (typeof input.effort === "string") config.effort = input.effort;
  if (runtimeMode) config.runtimeMode = runtimeMode;
  return Object.keys(config).length ? config : undefined;
}

function method(value: unknown): DeliveryMethod {
  if (value === "pr" || value === "merge" || value === "keep") return value;
  throw new BoardInputError("invalid_input", "method must be pr, merge or keep");
}

/** One `board.action` request, checked into the engine's own action type. */
export function ownerAction(input: Record<string, unknown>): OwnerAction {
  switch (input.action) {
    case "start":
    case "approvePlan":
    case "back":
    case "cancel":
    case "reject":
      return { type: input.action };
    case "answer":
      return { type: "answer", answers: answers(input.answers), note: text(input, "note", NOTE_MAX, true) };
    case "requestChanges":
      return { type: "requestChanges", note: text(input, "note", NOTE_MAX) };
    case "rework":
      return { type: "rework", findings: stringList(input.findings, "findings", 100), note: text(input, "note", NOTE_MAX, true) };
    case "deliver":
      return { type: "deliver", method: method(input.method) };
    case "retry":
      return { type: "retry", override: override(input) };
    default:
      throw new BoardInputError("invalid_input", "unknown board action");
  }
}
