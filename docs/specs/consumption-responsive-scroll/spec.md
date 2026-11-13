# Responsive consumption and scroll ownership
Status: approved by user (+).

Preserve stored widget position and dimensions. Fit chart labels, controls and both top-ten lists to wide/narrow and short/tall bodies. Add finite hover entry, switching and exit animation with reduced-motion fallback. Nested scrolling consumes an event while the child can move in the gesture direction; hand off only at its boundary. Reproduce shared GPUI behavior before fixing. Preserve accounting and navigation.

Additional authorized scope: remove inactive build caches and the unused legacy application. Preserve running MOLFAR Native.app, databases, config and the current native test build cache.
