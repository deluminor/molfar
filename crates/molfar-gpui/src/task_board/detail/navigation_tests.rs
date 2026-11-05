use super::tests::show;
use crate::task_board::settings::tests::click;
use gpui::{TestAppContext, VisualTestContext};
use molfar_core::task_board::{stage::contracts::constants::PLAN, types::ArtifactMeta};

#[gpui::test]
fn artifact_tabs_open_latest_allow_versions_and_escape_returns_to_overview(
    cx: &mut TestAppContext,
) {
    let window = show(cx, false);
    window
        .update(cx, |board, _, cx| {
            board.snapshot.as_mut().unwrap().artifacts = [1, 2]
                .map(|version| ArtifactMeta {
                    id: format!("plan-{version}"),
                    card_id: "first".into(),
                    kind: PLAN.into(),
                    version,
                    source: "stage".into(),
                    stage_run_id: None,
                    created_at: version,
                })
                .to_vec();
            cx.notify();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    click(visual, "board-tab-plan");
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-artifact-inline").is_some());
    assert!(visual.debug_bounds("board-artifact-dialog").is_none());
    window
        .update(visual, |board, _, _| {
            assert_eq!(board.detail_version, Some(2));
            assert!(board.artifact.as_ref().unwrap().error.is_some());
        })
        .unwrap();
    click(visual, "board-version-plan-1");
    visual.run_until_parked();
    window
        .update(visual, |board, _, _| {
            assert_eq!(board.detail_version, Some(1))
        })
        .unwrap();
    visual.simulate_keystrokes("escape");
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-detail").is_some());
    assert!(visual.debug_bounds("board-detail-drawer").is_some());
    window
        .update(visual, |board, _, _| assert!(board.artifact.is_none()))
        .unwrap();
    click(visual, "board-tab-plan");
    visual.run_until_parked();
    click(visual, "board-detail-close");
    visual.run_until_parked();
    window
        .update(visual, |board, _, _| {
            assert!(board.artifact.is_none());
            assert!(board.detail_tab.is_none());
        })
        .unwrap();
    visual.simulate_keystrokes("n");
    visual.run_until_parked();
    window
        .update(visual, |board, _, _| assert!(board.create_open))
        .unwrap();
}
