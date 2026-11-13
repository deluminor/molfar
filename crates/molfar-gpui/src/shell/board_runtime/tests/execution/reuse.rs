use super::{super::super::*, fixtures::*};
use gpui::TestAppContext;
use molfar_core::task_board::stage::lifecycle::types::StageAction;

#[gpui::test]
fn rework_continues_the_build_session_and_each_review_starts_fresh(cx: &mut TestAppContext) {
    let fixture = super::super::fixtures::Fixture::new();
    let window = start(&fixture, cx);
    action(&fixture, window, StageAction::ApprovePlan, cx);
    gate(&fixture, "final_review", cx);
    let review = locked(&fixture.store)
        .unwrap()
        .board_final_review("card")
        .unwrap();
    action(
        &fixture,
        window,
        StageAction::Rework {
            findings: vec!["F1".into()],
            note: String::new(),
            review_version: review.version,
        },
        cx,
    );
    gate(&fixture, "final_review", cx);

    let store = locked(&fixture.store).unwrap();
    let runs = store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .runs;
    let session = |stage: &str, nth: usize| {
        runs.iter()
            .filter(|run| run.stage == stage)
            .nth(nth)
            .and_then(|run| run.session_id.clone())
            .unwrap()
    };

    assert_eq!(session("implement", 0), session("rework", 0));
    assert_ne!(session("code_review", 0), session("code_review", 1));
    assert_ne!(session("code_review", 0), session("implement", 0));
    assert!(runs.iter().all(|run| run.status == "succeeded"));
    let resumes = std::fs::read_to_string(fixture.root.join("resumes")).unwrap_or_default();
    assert_eq!(
        resumes.lines().count(),
        1,
        "only the rework resumes a session"
    );
}

#[gpui::test]
fn a_full_build_session_compacts_before_the_rework_prompt(cx: &mut TestAppContext) {
    let fixture = super::super::fixtures::Fixture::new();
    let window = start(&fixture, cx);
    action(&fixture, window, StageAction::ApprovePlan, cx);
    gate(&fixture, "final_review", cx);

    let review = {
        let store = locked(&fixture.store).unwrap();
        let runs = store
            .board_snapshot(None, false, Some("card"))
            .unwrap()
            .runs;
        let build = runs
            .iter()
            .find(|run| run.stage == "implement")
            .and_then(|run| run.session_id.clone())
            .unwrap();
        let native = store.resolve_session_id(&build).unwrap();
        let full = molfar_core::context::Usage {
            used: 180_000,
            window: Some(200_000),
        };
        store.save_context_usage(native, &full).unwrap();
        store.board_final_review("card").unwrap()
    };
    action(
        &fixture,
        window,
        StageAction::Rework {
            findings: vec!["F1".into()],
            note: String::new(),
            review_version: review.version,
        },
        cx,
    );
    gate(&fixture, "final_review", cx);

    let compactions = std::fs::read_to_string(fixture.root.join("compactions")).unwrap_or_default();
    assert_eq!(compactions.lines().count(), 1);
    let store = locked(&fixture.store).unwrap();
    let runs = store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .runs;
    assert!(runs.iter().all(|run| run.status == "succeeded"), "{runs:?}");
    assert_eq!(runs.iter().filter(|run| run.stage == "rework").count(), 1);
}
