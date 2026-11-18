# Board render performance plan

Preserve the four approved performance commits. Shell already caches Board and detail sync compares borrowed text, but GPUI invalidates every ancestor of a notified spinner. A cached child cannot remove that dependency.

Retain bounded animated paths in GPUI's scene for Board and working-session spinners. The shared clock updates the visible windows' retained paths at half rate and requests presentation. Draw ordering allocates against the full spinner envelope. Cache replay preserves the path animation registration and removing the element drops it on the next normal draw. Full layout and normal notifications remain the source of structural changes. Presentation still composites the window. Unrelated animation and streaming leases keep their existing behavior.

Keep the existing text identity guard and let the retained paint path reuse the entire drawer's previous layout on spinner ticks. Real Board data, interactions and preview changes continue to invalidate through their existing paths. Keep the existing sidebar duration timer and enforce a single cancellable 1 Hz transcript duration task. Isolate any clock verification from live state.

Risks are stale cached scene registrations, animation geometry escaping its order bounds, stopped clocks and missed Board invalidation. Cover tick, ordinary redraw, reduced motion and removal in the GPUI harness. Review Board notification paths and run native check and size check. Web gate applies if TypeScript changes. No repo root AGENTS.md or CLAUDE.md exists in this checkout. Shared AGENTS and approved constraints apply.

## Consistency check

R1 maps to T1 and T4, R2 and R3 to T2 and T4, R4 to T3 and T4, and R5 to T4. The plan keeps motion, visibility, stale results, live state, and release constraints in the scope defined by the spec. No open product decisions or conflicting requirements.
