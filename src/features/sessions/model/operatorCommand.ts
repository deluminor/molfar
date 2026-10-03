import type { BuiltinSkill } from "../../skills/model/skills";
import type { Block } from "./session";

export const OPERATOR_COMMAND: BuiltinSkill = {
  kind: "builtin",
  name: "operator",
  invocation: "operator",
  description:
    "Give this thread access to MOLFAR sessions, folders, and notes.",
  scope: "builtin",
  source: "molfar",
};

/** Activate app access with a leading composer command. */
export function consumeOperatorCommand(text: string): {
  text: string;
  matched: boolean;
} {
  const match = text.match(/^\s*\/operator(?=\s|$)\s*/i);
  if (!match) return { text, matched: false };
  return { text: text.slice(match[0].length), matched: true };
}

/** A submitted /operator turn keeps CLI access available in later turns. */
export function isOperatorUserTurn(block: Block): boolean {
  return (
    block.role === "user" &&
    !block.draft &&
    !block.internal &&
    block.molfar === true
  );
}

export function operatorEnabledInThread(blocks: Block[]): boolean {
  return blocks.some(isOperatorUserTurn);
}
