const IDLE_AGENT_LIMIT_KEY = "molfar.idleAgentLimit";

/** How many finished conversations keep their agent CLI warm. */
export const IDLE_AGENT_LIMITS = [0, 1, 2, 3, 5] as const;
export type IdleAgentLimit = (typeof IDLE_AGENT_LIMITS)[number];
export const IDLE_AGENT_LIMIT_DEFAULT: IdleAgentLimit = 3;

export function loadIdleAgentLimit(): IdleAgentLimit {
  try {
    const raw = Number(localStorage.getItem(IDLE_AGENT_LIMIT_KEY) ?? NaN);
    return (
      IDLE_AGENT_LIMITS.find((limit) => limit === raw) ??
      IDLE_AGENT_LIMIT_DEFAULT
    );
  } catch {
    return IDLE_AGENT_LIMIT_DEFAULT;
  }
}

export function saveIdleAgentLimit(value: IdleAgentLimit) {
  try {
    localStorage.setItem(IDLE_AGENT_LIMIT_KEY, String(value));
  } catch {
    // private mode / quota
  }
}
