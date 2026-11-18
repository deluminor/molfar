# Tasks

- [x] T1 (R1–R4) Audit the four commits, previous investigation, Board notification paths and existing timers.
- [x] T2 (R2–R3) Add failing GPUI render-count coverage, then isolate Board and session spinner rendering in shared pulse, the spinner modules and the GPUI scene/window. Check cache replay, stopped and reduced-motion behavior.
- [x] T3 (R4) Verify sidebar label cadence and the idle Board threshold. Cover rapid transcript stop/restart and keep a single cancellable elapsed task.
- [x] T4 (R1–R5) Run isolated regressions, native and size gates, check diff and commit the authorized work locally. Record measured frames and gaps.


## Isolated verification

- Session spinner baseline at `35b5f1e2`: eight ticks produced four window draws and 16 entity renders.
- Retained paint: eight ticks produced four animation steps, zero window draws and zero entity renders in each of the working-session and running-card drawer cases.
- Idle Board: three window draws over 20 simulated seconds and a parked clock. Unrelated Shell notifications preserved the Board render count.
- Ten focused cases passed. They cover cached replay, reduced motion, hidden and clipped marks, stop, rapid transcript restart, Board navigation and unchanged previews.
- Window CPU, GPU and compositor cost were outside this harness. Normal Board data changes still rebuild the drawer using the cached parsed Markdown.


## Final gates

- `npm run native:check` exited 0 after a sandbox escalation for local fixtures. Formatting and Clippy passed. Tests passed: 44 Node, 1,011 core, 1,186 GPUI, and 6 wheel. The suite ignored 2 core and 11 GPUI tests.
- `npm run check:size` and `git diff --check` exited 0. The web gate was conditional on TypeScript changes. This diff contains none.
- The first native run exited 101 because the sandbox blocked local sockets and process fixtures. The first elevated run exited 101 because its running-card fixture was clipped. The final fixture exercises both a visible running card and a clipped one.
- The preserved implementation report lists the OpenBot smoke under Owner verification. No live card or session data was written.
