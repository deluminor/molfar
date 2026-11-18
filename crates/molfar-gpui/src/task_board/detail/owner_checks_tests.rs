use crate::task_board::tests::{card, window};
use gpui::{TestAppContext, VisualTestContext};
use molfar_core::task_board::{
    constants::{FINAL_REVIEW, IDLE, IMPLEMENT},
    stage::contracts::constants::{IMPL_REPORT, REVIEW},
    types::{ArtifactMeta, Snapshot},
};

fn meta(kind: &str) -> ArtifactMeta {
    ArtifactMeta {
        id: kind.into(),
        card_id: "card".into(),
        kind: kind.into(),
        version: 1,
        source: "stage".into(),
        stage_run_id: None,
        created_at: 1,
    }
}

fn show(cx: &mut TestAppContext, column: &str) -> VisualTestContext {
    let window = window(cx);
    window
        .update(cx, |board, _, cx| {
            let mut current = card("card", column);
            current.run_state = IDLE.into();
            board.selected = Some("card".into());
            board.drawer_open = true;
            board.finish(
                board.revision,
                Ok(Snapshot {
                    cards: vec![current],
                    selected: Some("card".into()),
                    artifacts: vec![meta(IMPL_REPORT), meta(REVIEW)],
                    ..Default::default()
                }),
                cx,
            );
            board.owner_checks.set_for_test(
                "card",
                vec!["AC-10: live OpenBot smoke".into(), "Pair the phone".into()],
            );
            cx.notify();
        })
        .unwrap();
    let visual = VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    visual
}

#[gpui::test]
fn final_review_lists_every_owner_check_in_the_waiting_notice(cx: &mut TestAppContext) {
    let mut visual = show(cx, FINAL_REVIEW);

    let notice = visual.debug_bounds("board-waiting").unwrap();
    let list = visual.debug_bounds("board-owner-checks").unwrap();
    assert!(notice.contains(&list.center()));
    assert!(visual.debug_bounds("board-owner-check-0").is_some());
    assert!(visual.debug_bounds("board-owner-check-1").is_some());
}

#[gpui::test]
fn owner_checks_stay_hidden_before_final_review(cx: &mut TestAppContext) {
    let mut visual = show(cx, IMPLEMENT);

    assert!(visual.debug_bounds("board-owner-checks").is_none());
}
