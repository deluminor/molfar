# Board render performance

Continuation approved on the #40 feature branch. Original investigation: `/tmp/wisp-board/sidebar-redraw-investigation.md`.

- R1. An unrelated Shell notification preserves the Board render count. Board refresh, selection, focus and input still update.
- R2. Remove the running border. Visible Board and working-session spinners animate at approximately 15 Hz. Their clock ticks render neither Shell nor Board. Reduced motion displays the resting frame. Hidden, removed and stopped marks cease driving visible frames.
- R3. Unchanged drawer text does not clone the card or reparse Markdown. Spinner ticks leave drawer layout, usage and timeline untouched. Same-card changes, switching cards and asynchronous results still reach the drawer.
- R4. Live durations update no faster than once per second per surface. Stopped clocks quiesce. An idle Board window draws at most four frames in 20 simulated seconds.
- R5. Verify in isolated GPUI tests and run the branch gates. Commit locally using human authorship. Keep #40's live state and existing artifacts untouched. No app launch, browser, push, merge or release.
