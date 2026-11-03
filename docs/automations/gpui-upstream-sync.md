# GPUI upstream sync — canonical prompt

Updated November 3, 2026. Use [Sync MonoCode main into GPUI integration](upstream-sync.md).

The sole source is MonoCode `upstream/main`; its GPUI branch was merged there.
The sole sync target is MOLFAR `migration/gpui-into-main`, including desktop,
mobile, native and shared code. No separate upstream sync targets MOLFAR `main`.
The human finishes migration and merges PR #127. Preserve its draft/ready status.
After that merge the automation stops for an explicit target-policy update.

Updating this document does not update installed automation configuration.
Preserve schedule, model and enabled state when installing the canonical prompt.
