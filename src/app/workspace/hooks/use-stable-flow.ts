import { useState } from "react";

/**
 * Creates a flow once for the component's lifetime. The result never changes,
 * like React's setState functions (biome.json marks it stable).
 */
export function useStableFlow<T>(create: () => T): T {
  const [flow] = useState(create);
  return flow;
}
