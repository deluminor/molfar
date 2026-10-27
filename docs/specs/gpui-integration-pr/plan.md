# Approved PR preparation plan

## Goal
Publish a reviewable draft integration proposal and evidence-based automation audit within the explicitly authorized scope.

## Technical Approach
Use live GitHub refs, isolated current session worktree, immutable native source snapshot and preserved copies of original planning. No feature code or automation behavior changes.

## Architecture Overview
MOLFAR main remains the product baseline. migration/gpui retains upstream-native history. Existing patch sync and proposed native merge sync remain separate. GitHub ancestry constraints must be reported honestly.

## Risks and Mitigations
Unrelated histories: investigate safe representation and ask before changing representation. Remote race: create-only publication, never force push. Stale planning: publish dated status corrections without changing original evidence. Unknown schedules: use supported CLI only; no private DB/config secrets. Native identity: no runtime until isolated identity/storage and copied fixtures exist.

## Execution Stages
1. Inspect refs and preserve source evidence.
2. Read full planning and assess ancestry.
3. Audit automation and obtain independent specialist review.
4. Run practical checks and prepare report/checklist.
5. Publish branch and draft PR where safely representable.
6. Verify remote PR body/refs and notify Wisp.

## Testing Strategy
Read-only refs/API checks; script fixture tests; offline/scoped native checks in isolated snapshot. Record all exit codes and skips. No browser, app, device, release or write-capable sync execution.

Constitution check: PASS for preparation only. Grill skipped: scope explicitly settled; ancestry representation decision is pending user response. No migration implementation is authorized.
