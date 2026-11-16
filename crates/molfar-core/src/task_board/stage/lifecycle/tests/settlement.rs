use super::fixtures::{complete, fixture};
use crate::task_board::stage::lifecycle::types::{FailureStatus, NoticeKind};
use rusqlite::Connection;

#[test]
fn grill_lifecycle_success_saves_exact_artifacts_once_and_advances_manual_gate() {
    let (_dir, mut store) = fixture();
    let output = complete(&mut store, "run-one");
    let effect = store.board_finish_stage("run-one", &output).unwrap();
    assert!(effect.changed);
    let card = effect.card.unwrap();
    assert_eq!(card.column_id, "plan_approval");
    assert_eq!(card.run_state, "idle");
    assert_eq!(effect.notice.unwrap().kind, NoticeKind::Gate);
    assert_eq!(store.board_stage_artifacts("card").unwrap().len(), 2);
    assert_eq!(
        store.board_stage_artifact("card", "spec", 1).unwrap(),
        "A specification"
    );
    assert!(
        !store
            .board_finish_stage("run-one", &output)
            .unwrap()
            .changed
    );
    assert!(
        !store
            .board_fail_stage("run-one", FailureStatus::Failed, "late")
            .unwrap()
            .changed
    );
    assert_eq!(store.board_stage_artifacts("card").unwrap().len(), 2);
}

#[test]
fn grill_lifecycle_artifact_fault_rolls_back_metadata_and_retry_preserves_orphan() {
    let (dir, mut store) = fixture();
    let output = complete(&mut store, "run-one");
    let conn = Connection::open(store.database_path()).unwrap();
    conn.execute_batch("CREATE TRIGGER fail_plan BEFORE INSERT ON task_board_artifacts WHEN NEW.kind='plan' BEGIN SELECT RAISE(ABORT,'injected metadata failure'); END;").unwrap();
    assert!(store
        .board_finish_stage("run-one", &output)
        .unwrap_err()
        .contains("injected"));
    assert!(store.board_stage_artifacts("card").unwrap().is_empty());
    assert_eq!(
        store
            .board_stage_context("run-one")
            .unwrap()
            .unwrap()
            .run
            .status,
        "running"
    );
    assert!(dir.path().join("task-board/card/spec-1.md").exists());
    conn.execute_batch("DROP TRIGGER fail_plan;").unwrap();
    assert!(
        store
            .board_finish_stage("run-one", &output)
            .unwrap()
            .changed
    );
    assert_eq!(store.board_stage_artifacts("card").unwrap().len(), 2);
}

#[test]
fn grill_lifecycle_unknown_orphan_is_preserved_and_next_version_is_available() {
    let (dir, mut store) = fixture();
    let output = complete(&mut store, "run-one");
    let folder = dir.path().join("task-board/card");
    std::fs::create_dir_all(&folder).unwrap();
    std::fs::write(folder.join("spec-1.md"), "Preserve this unknown file").unwrap();
    store.board_finish_stage("run-one", &output).unwrap();
    assert_eq!(
        std::fs::read_to_string(folder.join("spec-1.md")).unwrap(),
        "Preserve this unknown file"
    );
    assert_eq!(
        store.board_stage_artifact("card", "spec", 2).unwrap(),
        "A specification"
    );
}

#[test]
fn grill_lifecycle_dirty_byte_change_and_forged_outputs_never_advance() {
    let (_dir, mut store) = fixture();
    let mut output = complete(&mut store, "run-one");
    output.after.fingerprint = "changed bytes same porcelain".into();
    assert!(store.board_finish_stage("run-one", &output).is_err());
    output.after.fingerprint = "same-bytes".into();
    output.artifacts[0].body = "Forged spec".into();
    assert!(store.board_finish_stage("run-one", &output).is_err());
    assert_eq!(
        store
            .board_stage_context("run-one")
            .unwrap()
            .unwrap()
            .card
            .column_id,
        "grill"
    );
    assert!(store.board_stage_artifacts("card").unwrap().is_empty());
}
