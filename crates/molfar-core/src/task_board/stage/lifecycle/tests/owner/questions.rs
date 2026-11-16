use super::gate;
use crate::task_board::stage::{lifecycle::types::StageAction, owner::types::Answer};

#[test]
fn owner_answers_ignore_unknown_numbers_and_last_duplicate_wins_like_desktop() {
    let (_dir, mut store) = gate();
    let revision = store.board_owner_review("card").unwrap().card.updated_at;
    store
        .board_stage_action(
            "card",
            revision,
            StageAction::Answer {
                answers: vec![
                    Answer {
                        number: 99,
                        answer: "Unknown answer".into(),
                    },
                    Answer {
                        number: 1,
                        answer: "Old answer".into(),
                    },
                    Answer {
                        number: 1,
                        answer: "Final answer".into(),
                    },
                ],
                note: String::new(),
            },
        )
        .unwrap();
    let body = store.board_stage_artifact("card", "answers", 1).unwrap();
    assert!(body.contains("**Answer:** Final answer"));
    assert!(!body.contains("Old answer"));
    assert!(!body.contains("Unknown answer"));
    assert!(body.contains("**Answer:** (no answer)"));
}

#[test]
fn owner_current_questions_fail_explicitly_when_missing_or_malformed() {
    let (dir, store) = gate();
    let path = dir.path().join("task-board/card/questions-1.md");
    for body in [
        "No question headings",
        "## Q999999999999999999999999999 — Too large",
    ] {
        std::fs::write(&path, body).unwrap();
        assert!(store.board_owner_review("card").is_err());
    }
    std::fs::remove_file(path).unwrap();
    assert!(store.board_owner_review("card").is_err());
}
