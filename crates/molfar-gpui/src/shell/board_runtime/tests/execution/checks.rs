use super::{super::super::*, fixtures::*};
use gpui::TestAppContext;
use molfar_core::task_board::stage::{
    choice::settings::SettingsPatch, lifecycle::types::StageAction,
};

#[gpui::test]
fn red_verify_command_reworks_twice_then_the_review_still_reaches_final_review(
    cx: &mut TestAppContext,
) {
    let fixture = super::super::fixtures::Fixture::new();
    locked(&fixture.store)
        .unwrap()
        .board_update_settings(&SettingsPatch::VerifyCommand {
            project: fixture.project.clone(),
            command: Some("test -f tracked.txt && exit 1".into()),
        })
        .unwrap();
    let window = start(&fixture, cx);
    action(&fixture, window, StageAction::ApprovePlan, cx);
    gate(&fixture, "final_review", cx);

    let store = locked(&fixture.store).unwrap();
    let snapshot = store.board_snapshot(None, false, Some("card")).unwrap();
    let runs: Vec<_> = snapshot
        .runs
        .iter()
        .map(|run| format!("{}:{}", run.stage, run.status))
        .collect();
    assert_eq!(
        runs,
        [
            "grill:succeeded",
            "implement:succeeded",
            "code_review:redirected",
            "rework:succeeded",
            "code_review:redirected",
            "rework:succeeded",
            "code_review:succeeded",
        ]
    );
    let sources: Vec<_> = snapshot
        .artifacts
        .iter()
        .filter(|meta| meta.kind == "rework_brief")
        .map(|meta| meta.source.as_str())
        .collect();
    assert_eq!(sources, ["checks", "checks"]);
    assert!(
        store
            .board_stage_artifact("card", "rework_brief", 1)
            .unwrap()
            .contains("failed with exit code 1")
    );
    assert_eq!(snapshot.cards[0].rework_cycle, 2);
}
