use super::*;
use crate::shell::board_runtime::tests::fixtures::{Fixture as BoardFixture, wait_until};
use molfar_core::task_board::{
    constants::{GRILL, PLAN_APPROVAL},
    stage::lifecycle::types::StageAction,
};

pub(super) fn board_principal(f: &BoardFixture) -> Principal {
    Principal {
        client_id: "client".into(),
        name: "Fixture".into(),
        grants: vec![GRANT::BoardRun, GRANT::Read(DOMAIN::Board)],
        resources: vec![],
        projects: vec![f.project.clone()],
    }
}

pub(super) fn stage_input(f: &BoardFixture, request: &str) -> Value {
    json!({"cardId":"card","expectedUpdatedAt":f.card().updated_at,"requestId":request})
}

#[gpui::test]
fn external_stage_receipts_and_answers_survive_retries(cx: &mut TestAppContext) {
    let f = BoardFixture::new();
    std::fs::write(f.root.join("behavior"), "questions").unwrap();
    let window = f.window(cx);
    let principal = board_principal(&f);
    let mut denied = principal.clone();
    denied.grants.retain(|grant| *grant != GRANT::BoardRun);
    let start = stage_input(&f, "start");
    assert!(
        !tools::visible(&denied)
            .iter()
            .any(|tool| tool.name == "board_start")
    );
    assert!(
        call(window, &denied, "board_start", start.clone(), cx)
            .unwrap_err()
            .contains("lacks permission")
    );
    let before = f.card();
    assert!(
        call(
            window,
            &principal,
            "board_back",
            stage_input(&f, "illegal"),
            cx
        )
        .is_err()
    );
    assert_eq!(f.card(), before);
    assert!(!f.root.join("submissions").exists());
    let (reply, mut first) = reply_channel();
    let (duplicate_reply, mut duplicate) = reply_channel();
    window
        .update(cx, |shell, _, cx| {
            shell.handle_external_call(
                Call {
                    principal: principal.clone(),
                    tool: "board_start",
                    arguments: start.clone(),
                    reply,
                },
                cx,
            );
            shell.handle_external_call(
                Call {
                    principal: principal.clone(),
                    tool: "board_start",
                    arguments: start.clone(),
                    reply: duplicate_reply,
                },
                cx,
            );
        })
        .unwrap();
    cx.run_until_parked();
    let original = first.try_recv().unwrap().unwrap();
    assert!(
        duplicate
            .try_recv()
            .unwrap()
            .unwrap_err()
            .contains("still running")
    );
    assert_eq!(original["card"]["column"], GRILL);
    assert_eq!(
        call(window, &principal, "board_start", start.clone(), cx).unwrap(),
        original
    );
    let mut changed = start;
    changed["expectedUpdatedAt"] = json!(f.card().updated_at);
    assert!(
        call(window, &principal, "board_start", changed, cx)
            .unwrap_err()
            .contains("different input")
    );

    wait_until(cx, || f.card().column_id == PLAN_APPROVAL);
    let mut answer = stage_input(&f, "answer");
    answer["answers"] = json!([{"number":1,"answer":""}]);
    answer["note"] = json!("Owner checkpoint");
    call(window, &principal, "board_answer", answer, cx).unwrap();
    wait_until(cx, || {
        f.card().grill_round == 2 && f.card().column_id == PLAN_APPROVAL
    });

    let mut changes = stage_input(&f, "lost-reply");
    changes["note"] = json!("Recover the third round");
    {
        let mut store = locked(&f.store).unwrap();
        let digest = receipts::digest("board_request_changes", &changes);
        assert_eq!(
            store
                .external_receipt_begin(
                    "client",
                    &receipts::ReceiptTarget::Project(f.project.clone()),
                    "board_request_changes",
                    "lost-reply",
                    &digest,
                )
                .unwrap(),
            BEGIN::Fresh
        );
        store
            .board_stage_action(
                "card",
                changes["expectedUpdatedAt"].as_i64().unwrap(),
                StageAction::RequestChanges("Recover the third round".into()),
            )
            .unwrap();
    }
    assert!(
        call(window, &principal, "board_request_changes", changes, cx)
            .unwrap_err()
            .starts_with("conflict:")
    );
    BoardFixture::poll(window, cx);
    wait_until(cx, || {
        f.card().grill_round == 3 && f.card().column_id == PLAN_APPROVAL
    });
    let store = locked(&f.store).unwrap();
    let body = store.board_stage_artifact("card", "answers", 1).unwrap();
    assert!(body.contains("**Answer:** Only tests"));
    assert!(body.contains("Owner checkpoint"));
    assert_eq!(
        store
            .board_snapshot(None, false, Some("card"))
            .unwrap()
            .runs
            .len(),
        3
    );
    let submissions = std::fs::read_to_string(f.root.join("submissions")).unwrap();
    assert_eq!(submissions.lines().count(), 3);
    assert!(
        submissions
            .lines()
            .nth(1)
            .unwrap()
            .contains("answers-v1.md")
    );
    assert!(
        store
            .external_audit_log()
            .unwrap()
            .iter()
            .any(|entry| entry.action == "board_start" && entry.outcome == "denied")
    );
}
