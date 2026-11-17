use super::super::{super::*, fixtures::*};
use super::fixtures::*;
use gpui::TestAppContext;
use molfar_core::task_board::{stage::lifecycle::types::StageAction, types::StageRun};

fn implement_runs(fixture: &Fixture) -> Vec<StageRun> {
    locked(&fixture.store)
        .unwrap()
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .runs
        .into_iter()
        .filter(|run| run.stage == "implement")
        .collect()
}

fn submissions(fixture: &Fixture) -> Vec<String> {
    std::fs::read_to_string(fixture.root.join("submissions"))
        .unwrap_or_default()
        .lines()
        .map(str::to_owned)
        .collect()
}

#[gpui::test]
fn a_partial_turn_continues_in_the_same_session(cx: &mut TestAppContext) {
    let fixture = Fixture::new();
    let window = start(&fixture, cx);
    std::fs::write(fixture.root.join("behavior"), "partial-once").unwrap();
    action(&fixture, window, StageAction::ApprovePlan, cx);
    gate(&fixture, "final_review", cx);

    let runs = implement_runs(&fixture);
    assert_eq!(
        runs.iter()
            .map(|run| run.status.as_str())
            .collect::<Vec<_>>(),
        ["partial", "succeeded"]
    );
    assert!(runs[0].session_id.is_some());
    assert_eq!(runs[0].session_id, runs[1].session_id);
    let resumes = std::fs::read_to_string(fixture.root.join("resumes")).unwrap_or_default();
    assert_eq!(resumes.lines().count(), 1, "the continuation resumes");

    let continued = submissions(&fixture)
        .into_iter()
        .filter(|line| line.contains("You are the Implement stage"))
        .nth(1)
        .unwrap();
    assert!(continued.contains("The plan is not finished"));
    assert!(!continued.contains("## Handoff files"));
}
