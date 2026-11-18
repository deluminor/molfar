use super::stage::{board_principal, stage_input};
use super::*;
use crate::shell::board_runtime::tests::fixtures::{Fixture as BoardFixture, wait_until};
use molfar_core::task_board::{constants::PLAN_APPROVAL, stage::lifecycle::types::StageAction};

#[gpui::test]
fn cancel_retry_and_back_follow_the_same_column_and_gate_rules(cx: &mut TestAppContext) {
    let f = BoardFixture::new();
    let principal = board_principal(&f);
    let window = f.window(cx);
    BoardFixture::hold_poll(window, cx);
    for (tool, request, column, state) in [
        ("board_start", "start", "grill", "queued"),
        ("board_cancel", "cancel", "grill", "failed"),
        ("board_retry", "retry", "grill", "queued"),
        ("board_cancel", "cancel-retry", "grill", "failed"),
        ("board_back", "back", "backlog", "idle"),
    ] {
        let result = call(window, &principal, tool, stage_input(&f, request), cx).unwrap();
        assert_eq!(result["card"]["column"], column);
        assert_eq!(result["card"]["runState"], state);
        if state == "failed" {
            assert!(
                result["allowedActions"]
                    .as_array()
                    .unwrap()
                    .contains(&json!("retry"))
            );
        }
        if state == "queued" {
            assert!(
                result["allowedActions"]
                    .as_array()
                    .unwrap()
                    .contains(&json!("cancel"))
            );
        }
    }
    BoardFixture::resume_poll(window, cx);
    assert!(!f.root.join("submissions").exists());
}

#[gpui::test]
fn request_changes_and_rework_launch_through_the_desktop_runner(cx: &mut TestAppContext) {
    let f = BoardFixture::new();
    let principal = board_principal(&f);
    let window = f.window(cx);
    call(
        window,
        &principal,
        "board_start",
        stage_input(&f, "start"),
        cx,
    )
    .unwrap();
    wait_until(cx, || f.card().column_id == PLAN_APPROVAL);
    let mut input = stage_input(&f, "changes");
    input["note"] = json!("Please revise this.");
    call(window, &principal, "board_request_changes", input, cx).unwrap();
    wait_until(cx, || {
        f.card().grill_round == 2 && f.card().column_id == PLAN_APPROVAL
    });
    let store = locked(&f.store).unwrap();
    assert!(
        store
            .board_stage_artifact("card", "answers", 1)
            .unwrap()
            .contains("Please revise this.")
    );
    drop(store);

    window
        .update(cx, |shell, _, cx| {
            shell.board_action(
                "card".into(),
                f.card().updated_at,
                StageAction::ApprovePlan,
                cx,
            );
        })
        .unwrap();
    wait_until(cx, || f.card().column_id == "final_review");
    let version = locked(&f.store)
        .unwrap()
        .board_final_review("card")
        .unwrap()
        .version;
    let mut input = stage_input(&f, "rework");
    input["findings"] = json!(["F1"]);
    input["reviewVersion"] = json!(version);
    call(window, &principal, "board_rework", input, cx).unwrap();
    wait_until(cx, || {
        f.card().rework_cycle == 1 && f.card().column_id == "final_review"
    });
    let store = locked(&f.store).unwrap();
    assert!(
        store
            .board_stage_artifact("card", "rework_brief", 1)
            .unwrap()
            .contains("Fix this race.")
    );
}
