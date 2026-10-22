import type { HabitSchedule } from "./habit-schedule";

/**
 * Cards a Familiar puts in its chat beside its words, with the app CLI's
 * `chat.card`. A card names what it is about and the app shows its current
 * state when it is drawn, so a PR card posted while the PR was open says
 * "Merged" the next day.
 */
export type FamiliarCard =
  | {
      type: "pr";
      /** owner/name; the project's own repository when left out. */
      repo?: string;
      number: number;
      /** One line from the Familiar on why it matters. */
      note?: string;
    }
  | { type: "session"; sessionId: string; note?: string }
  | {
      /** Replies the user can send with a tap, after a question. */
      type: "choices";
      options: string[];
    }
  | {
      /** A habit the Familiar suggests; nothing runs until the user starts it. */
      type: "habit";
      name: string;
      instructions: string;
      schedule: HabitSchedule;
    };
