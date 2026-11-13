use super::{super::*, fixtures::*};
use gpui::TestAppContext;
use molfar_core::task_board::stage::{choice, lifecycle::types::StageAction};

#[gpui::test]
fn owner_review_drives_two_native_grill_rounds_with_versioned_handoff(cx: &mut TestAppContext) {
    let fixture = Fixture::new();
    let before =
        molfar_core::task_board::stage::checkout::snapshot(std::path::Path::new(&fixture.project))
            .unwrap();
    let window = fixture.window(cx);
    window
        .update(cx, |shell, _, cx| {
            shell.board_action(
                "card".into(),
                fixture.card().updated_at,
                StageAction::Start,
                cx,
            );
        })
        .unwrap();
    wait_until(cx, || {
        fixture.card().column_id == "plan_approval" || fixture.card().run_state == "failed"
    });
    assert_eq!(fixture.card().column_id, "plan_approval");
    let original_revision = fixture.card().updated_at;
    window
        .update(cx, |shell, _, cx| {
            shell.board_action(
                "card".into(),
                original_revision,
                StageAction::EditPlan("Owner revised plan".into()),
                cx,
            );
        })
        .unwrap();
    wait_until(cx, || fixture.card().updated_at != original_revision);
    let second_revision = fixture.card().updated_at;
    window
        .update(cx, |shell, window, cx| {
            shell.board_action(
                "card".into(),
                second_revision,
                StageAction::RequestChanges("Include retry behavior".into()),
                cx,
            );
            shell.close_app_view(window, cx);
            shell.board = None;
            shell.app_view_events.clear();
        })
        .unwrap();
    wait_until(cx, || {
        let card = fixture.card();
        card.grill_round == 2 && (card.column_id == "plan_approval" || card.run_state == "failed")
    });
    let card = fixture.card();
    assert_eq!(card.column_id, "plan_approval", "{:?}", card.last_error);
    let store = locked(&fixture.store).unwrap();
    let snapshot = store.board_snapshot(None, false, Some("card")).unwrap();
    assert_eq!(snapshot.runs.len(), 2);
    assert!(
        snapshot
            .runs
            .iter()
            .all(|run| run.status == "succeeded" && run.dispatch == "settled")
    );
    // Grill rounds continue one session, so round two does not re-read the repository.
    assert_eq!(snapshot.runs[0].session_id, snapshot.runs[1].session_id);
    assert_eq!(
        store.board_stage_artifact("card", "plan", 2).unwrap(),
        "Owner revised plan"
    );
    assert_eq!(
        store.board_stage_artifact("card", "plan", 3).unwrap(),
        "Fixture plan"
    );
    assert_eq!(
        store.board_stage_artifact("card", "answers", 1).unwrap(),
        "## Note\n\nInclude retry behavior"
    );
    let submissions = std::fs::read_to_string(fixture.root.join("submissions")).unwrap();
    let turns: Vec<_> = submissions.lines().collect();
    assert_eq!(turns.len(), 2);
    assert!(turns[1].contains("Grill round 2."));
    assert!(turns[1].contains("## Session") && !turns[0].contains("## Session"));
    assert!(turns[1].contains("plan-v2.md"));
    assert!(turns[1].contains("answers-v1.md"));
    assert!(!turns[1].contains("Owner revised plan"));
    assert!(!turns[1].contains("Include retry behavior"));
    let root = std::path::Path::new(card.worktree_path.as_deref().unwrap());
    assert_eq!(
        std::fs::read_to_string(root.join(".molfar/board/plan-v2.md")).unwrap(),
        "Owner revised plan"
    );
    assert_eq!(
        before,
        molfar_core::task_board::stage::checkout::snapshot(std::path::Path::new(&fixture.project))
            .unwrap()
    );
}

#[gpui::test]
fn restart_with_accepted_second_round_interrupts_without_creating_a_session(
    cx: &mut TestAppContext,
) {
    let fixture = Fixture::new();
    {
        let mut store = locked(&fixture.store).unwrap();
        rusqlite::Connection::open(store.database_path()).unwrap().execute("UPDATE task_board_cards SET column_id='grill',run_state='queued',grill_round=2 WHERE id='card'", []).unwrap();
        let card = store.board_claim_next_stage().unwrap().unwrap();
        let resolved = choice::types::ResolvedStageChoice {
            kind: Kind::Codex,
            model: "gpt-test".into(),
            settings: Default::default(),
            runtime_mode: "auto".into(),
            skills: vec![],
            warnings: vec![],
            model_settings: serde_json::json!({}),
        };
        store
            .board_accept_stage("card", card.updated_at, "accepted-second", &resolved)
            .unwrap();
    }
    let window = fixture.window(cx);
    window
        .update(cx, |shell, _, cx| shell.poll_board(true, cx))
        .unwrap();
    wait_until(cx, || fixture.card().run_state == "failed");
    let store = locked(&fixture.store).unwrap();
    assert_eq!(
        store
            .board_stage_context("accepted-second")
            .unwrap()
            .unwrap()
            .run
            .status,
        "interrupted"
    );
    assert!(store.board_owned_session_ids().unwrap().is_empty());
    assert!(!fixture.root.join("submissions").exists());
}
