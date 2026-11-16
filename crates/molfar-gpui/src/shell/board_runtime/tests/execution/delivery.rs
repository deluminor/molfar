use super::super::{super::*, fixtures::*};
use super::fixtures::*;
use gpui::{TestAppContext, WindowHandle};
use molfar_core::task_board::{
    delivery::{constants::INTERRUPTED, record, types::DeliveryMethod},
    stage::{checkout, lifecycle::types::StageAction},
};
use std::path::Path;

fn reviewed(fixture: &Fixture, cx: &mut TestAppContext) -> WindowHandle<Shell> {
    let window = start(fixture, cx);
    action(fixture, window, StageAction::ApprovePlan, cx);
    gate(fixture, "final_review", cx);
    window
}

fn branch_exists(fixture: &Fixture, branch: &str) -> bool {
    std::process::Command::new("git")
        .current_dir(&fixture.project)
        .args([
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{branch}"),
        ])
        .status()
        .unwrap()
        .success()
}

#[gpui::test]
fn keep_branch_delivery_removes_worktree_detaches_sessions_and_keeps_branch(
    cx: &mut TestAppContext,
) {
    let fixture = Fixture::new();
    let original = checkout::snapshot(Path::new(&fixture.project)).unwrap();
    let window = reviewed(&fixture, cx);
    let card = fixture.card();
    let worktree = card.worktree_path.clone().unwrap();
    let branch = card.branch.clone().unwrap();

    window
        .update(cx, |shell, _, cx| {
            shell.board_deliver("card".into(), card.updated_at, DeliveryMethod::Keep, cx)
        })
        .unwrap();
    wait_until(cx, || fixture.card().column_id == "done");

    let card = fixture.card();
    assert_eq!(
        (card.run_state.as_str(), card.worktree_path.as_deref()),
        ("idle", None)
    );
    assert_eq!(card.last_error, None);
    assert_eq!(
        record::parse(card.delivery_json.as_deref()).unwrap().method,
        DeliveryMethod::Keep
    );
    assert!(!Path::new(&worktree).exists());
    assert!(branch_exists(&fixture, &branch));
    let store = locked(&fixture.store).unwrap();
    assert!(
        store
            .board_latest_artifact("card", "delivery")
            .unwrap()
            .is_some()
    );
    let stage_sessions: Vec<i64> = store
        .session_worktrees()
        .unwrap()
        .into_iter()
        .filter(|(_, path)| path.as_deref() == Some(worktree.as_str()))
        .map(|(id, _)| id)
        .collect();
    assert!(!stage_sessions.is_empty());
    assert!(stage_sessions.iter().all(|id| {
        store
            .agent_settings(*id)
            .unwrap()
            .is_some_and(|settings| settings.worktree_removed)
    }));
    assert_eq!(
        checkout::snapshot(Path::new(&fixture.project)).unwrap(),
        original
    );
}

#[gpui::test]
fn unreachable_github_fails_delivery_then_reject_archives_and_drops_unpushed_branch(
    cx: &mut TestAppContext,
) {
    let fixture = Fixture::new();
    let window = reviewed(&fixture, cx);
    let card = fixture.card();
    let worktree = card.worktree_path.clone().unwrap();
    let branch = card.branch.clone().unwrap();

    window
        .update(cx, |shell, _, cx| {
            shell.board_deliver("card".into(), card.updated_at, DeliveryMethod::Pr, cx)
        })
        .unwrap();
    wait_until(cx, || fixture.card().run_state == "failed");

    let failed = fixture.card();
    assert_eq!(failed.column_id, "final_review");
    assert!(
        failed
            .last_error
            .as_deref()
            .unwrap()
            .starts_with("Only Keep branch is available")
    );
    assert!(Path::new(&worktree).exists());
    window
        .update(cx, |shell, _, cx| {
            shell.board_reject("card".into(), failed.updated_at, cx)
        })
        .unwrap();
    wait_until(cx, || fixture.card_archived());

    assert!(!Path::new(&worktree).exists());
    assert!(!branch_exists(&fixture, &branch));
}

#[gpui::test]
fn startup_fails_a_delivery_interrupted_by_quit(cx: &mut TestAppContext) {
    let fixture = Fixture::new();
    rusqlite::Connection::open(locked(&fixture.store).unwrap().database_path())
        .unwrap()
        .execute(
            "UPDATE task_board_cards SET column_id='final_review',run_state='running' WHERE id='card'",
            [],
        )
        .unwrap();

    fixture.window(cx);
    wait_until(cx, || fixture.card().run_state == "failed");

    assert_eq!(fixture.card().last_error.as_deref(), Some(INTERRUPTED));
}
