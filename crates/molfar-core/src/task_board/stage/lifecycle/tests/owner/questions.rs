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

#[test]
fn external_answers_and_desktop_answers_produce_identical_owner_artifacts() {
    use crate::app_access::board::stage::{apply, stage_action, StageTool};
    use serde_json::json;

    let (_desktop_dir, mut desktop) = gate();
    let (_external_dir, mut external) = gate();
    let desktop_card = desktop.board_owner_review("card").unwrap().card;
    let external_card = external.board_owner_review("card").unwrap().card;
    let expected = StageAction::Answer {
        answers: vec![Answer {
            number: 1,
            answer: " ".into(),
        }],
        note: "Review again".into(),
    };
    let (id, revision, action) = stage_action(
        StageTool::Answer,
        &json!({
            "cardId":"card","expectedUpdatedAt":external_card.updated_at,
            "requestId":"answer","answers":[{"number":1,"answer":" "}],"note":"Review again"
        }),
    )
    .unwrap();
    assert_eq!(action, expected);
    let desktop = desktop
        .board_stage_action("card", desktop_card.updated_at, expected)
        .map(|effect| {
            (
                effect.card,
                desktop.board_stage_artifact("card", "answers", 1).unwrap(),
            )
        })
        .unwrap();
    let result = apply(&mut external, &["/project".into()], &id, revision, action).unwrap();
    assert_eq!(result.card.column_id, desktop.0.column_id);
    assert_eq!(result.card.run_state, desktop.0.run_state);
    assert_eq!(result.card.grill_round, desktop.0.grill_round);
    assert_eq!(
        external.board_stage_artifact("card", "answers", 1).unwrap(),
        desktop.1
    );
}
