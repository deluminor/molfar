mod boundaries;
mod edit;
mod questions;
mod recovery;

use super::fixtures::{complete, complete_with_text, fixture};
use crate::{
    store::Store,
    task_board::stage::{lifecycle::types::StageAction, owner::types::Answer},
};

pub(super) fn gate() -> (tempfile::TempDir, Store) {
    let (dir, mut store) = fixture();
    store
        .board_create(
            &crate::task_board::types::CardCreate {
                id: "card".into(),
                project_cwd: "/project".into(),
                title: "A card".into(),
                description: "Description".into(),
                acceptance_criteria: String::new(),
                base_ref: None,
            },
            &[],
        )
        .unwrap();
    let text = "<<<MOLFAR:spec>>>Spec<<<END:spec>>><<<MOLFAR:plan>>>Plan<<<END:plan>>><<<MOLFAR:questions>>>## Q1 — Scope\r\nWhich?\r\n**Recommended:** Narrow\r\nwith tests\r\n\r\n## Q2: Target\r\nWhere?<<<END:questions>>>";
    let output = complete_with_text(&mut store, "first", text);
    store.board_finish_stage("first", &output).unwrap();
    (dir, store)
}

#[test]
fn owner_answers_use_current_questions_and_desktop_recommendation_fallback() {
    let (_dir, mut store) = gate();
    let review = store.board_owner_review("card").unwrap();
    assert_eq!(review.questions.len(), 2);
    assert_eq!(review.questions[0].body, "Which?");
    assert_eq!(review.questions[0].recommended, "Narrow\nwith tests");
    let effect = store
        .board_stage_action(
            "card",
            review.card.updated_at,
            StageAction::Answer {
                answers: vec![
                    Answer {
                        number: 1,
                        answer: "  ".into(),
                    },
                    Answer {
                        number: 2,
                        answer: "Here".into(),
                    },
                ],
                note: " Keep scope ".into(),
            },
        )
        .unwrap();
    assert_eq!(effect.card.grill_round, 2);
    assert_eq!(effect.card.run_state, "queued");
    assert_eq!(store.board_stage_artifact("card","answers",1).unwrap(),
        "## Q1 — Scope\n\n**Answer:** Narrow\nwith tests\n\n## Q2 — Target\n\n**Answer:** Here\n\n## Note\n\nKeep scope");
    let saved = store.board_stage_artifacts("card").unwrap();
    let answer = saved.iter().find(|meta| meta.kind == "answers").unwrap();
    assert_eq!(answer.source, "user");
    assert_eq!(answer.stage_run_id, None);
    assert!(store.board_owner_review("card").is_err());
}

#[test]
fn owner_blank_individual_answer_uses_no_answer_when_no_recommendation_exists() {
    let (_dir, mut store) = gate();
    let review = store.board_owner_review("card").unwrap();
    store
        .board_stage_action(
            "card",
            review.card.updated_at,
            StageAction::Answer {
                answers: vec![Answer {
                    number: 2,
                    answer: String::new(),
                }],
                note: String::new(),
            },
        )
        .unwrap();
    assert!(store
        .board_stage_artifact("card", "answers", 1)
        .unwrap()
        .contains("**Answer:** (no answer)"));
}

#[test]
fn owner_plan_edits_version_without_overwriting_and_stale_actions_leave_no_artifact() {
    let (dir, mut store) = gate();
    let original = store.board_owner_review("card").unwrap();
    let edited = store
        .board_stage_action(
            "card",
            original.card.updated_at,
            StageAction::EditPlan("Revised plan".into()),
        )
        .unwrap();
    assert_eq!(edited.card.column_id, "plan_approval");
    assert_eq!(edited.card.grill_round, 1);
    assert_eq!(
        store.board_owner_review("card").unwrap().plan,
        "Revised plan"
    );
    assert_eq!(
        store.board_stage_artifact("card", "plan", 1).unwrap(),
        "Plan"
    );
    let metadata = store.board_stage_artifacts("card").unwrap();
    for action in [
        StageAction::EditPlan("Stale".into()),
        StageAction::RequestChanges("Stale".into()),
        StageAction::Answer {
            answers: vec![],
            note: "Stale".into(),
        },
    ] {
        assert!(store
            .board_stage_action("card", original.card.updated_at, action)
            .unwrap_err()
            .contains("conflict"));
    }
    assert_eq!(store.board_stage_artifacts("card").unwrap(), metadata);
    assert!(!dir.path().join("task-board/card/plan-3.md").exists());
    assert!(!dir.path().join("task-board/card/answers-1.md").exists());
    drop(store);
    let store = Store::open_desktop(&dir.path().join("molfar.db")).unwrap();
    assert_eq!(
        store.board_owner_review("card").unwrap().plan,
        "Revised plan"
    );
}

#[test]
fn owner_empty_or_oversized_actions_are_refused_without_changing_card() {
    let (dir, mut store) = gate();
    let card = store.board_owner_review("card").unwrap().card;
    for action in [
        StageAction::EditPlan(" \n".into()),
        StageAction::RequestChanges(" ".into()),
        StageAction::Answer {
            answers: vec![],
            note: String::new(),
        },
        StageAction::EditPlan("x".repeat(2_000_001)),
    ] {
        assert!(store
            .board_stage_action("card", card.updated_at, action)
            .is_err());
        assert_eq!(store.board_owner_review("card").unwrap().card, card);
    }
    assert!(!dir.path().join("task-board/card/plan-2.md").exists());
    assert!(!dir.path().join("task-board/card/answers-1.md").exists());
}

#[test]
fn owner_question_free_success_does_not_reuse_earlier_round_questions() {
    let (_dir, mut store) = gate();
    let review = store.board_owner_review("card").unwrap();
    store
        .board_stage_action(
            "card",
            review.card.updated_at,
            StageAction::RequestChanges("Resolve scope".into()),
        )
        .unwrap();
    let output = complete(&mut store, "second");
    store.board_finish_stage("second", &output).unwrap();
    let review = store.board_owner_review("card").unwrap();
    assert!(review.questions.is_empty());
    store
        .board_stage_action(
            "card",
            review.card.updated_at,
            StageAction::RequestChanges("One final note".into()),
        )
        .unwrap();
    assert_eq!(
        store.board_stage_artifact("card", "answers", 2).unwrap(),
        "## Note\n\nOne final note"
    );
}
