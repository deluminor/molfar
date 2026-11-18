use super::{
    moves::legal_moves,
    types::{BoardAction, Position},
};

type Expected = Vec<(&'static str, BoardAction, bool)>;

fn moves(column: &str, run_state: &str, archived: bool) -> Vec<(String, BoardAction, bool)> {
    legal_moves(Position {
        column,
        run_state,
        archived,
    })
    .into_iter()
    .map(|m| (m.column, m.action, m.needs_input))
    .collect()
}

#[test]
fn legal_moves_match_desktop_drop_targets() {
    use BoardAction::*;
    let cases: [(&str, &str, Expected); 9] = [
        ("backlog", "idle", vec![("grill", Start, false)]),
        (
            "plan_approval",
            "idle",
            vec![
                ("implement", ApprovePlan, false),
                ("grill", RequestChanges, true),
            ],
        ),
        (
            "final_review",
            "idle",
            vec![("rework", Rework, true), ("done", Deliver, true)],
        ),
        (
            "final_review",
            "failed",
            vec![("rework", Rework, true), ("done", Deliver, true)],
        ),
        ("grill", "failed", vec![("backlog", Back, false)]),
        ("implement", "failed", vec![("plan_approval", Back, false)]),
        ("code_review", "failed", vec![("final_review", Back, false)]),
        ("implement", "running", vec![]),
        ("final_review", "running", vec![]),
    ];

    for (column, state, expected) in cases {
        let expected: Vec<_> = expected
            .into_iter()
            .map(|(target, action, input)| (target.to_owned(), action, input))
            .collect();
        assert_eq!(moves(column, state, false), expected, "{column}/{state}");
    }
    assert!(moves("backlog", "idle", true).is_empty());
    assert!(moves("done", "idle", false).is_empty());
}

#[test]
fn external_stage_actions_cover_column_state_and_archive_guards() {
    use super::allowed::action_allowed;
    use crate::{
        store::Store,
        task_board::types::{CardCreate, Snapshot},
    };
    use BoardAction::*;

    let folder = tempfile::tempdir().unwrap();
    let mut store = Store::open_desktop(&folder.path().join("board.db")).unwrap();
    for args in [
        &["init", "-q"][..],
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.test",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--allow-empty",
            "-qm",
            "fixture",
        ],
    ] {
        assert!(std::process::Command::new("git")
            .current_dir(folder.path())
            .args(args)
            .status()
            .unwrap()
            .success());
    }
    let project = folder.path().to_string_lossy().into_owned();
    let mut card = store
        .board_create(
            &CardCreate {
                id: "card".into(),
                project_cwd: project.clone(),
                title: "Guard fixture".into(),
                description: "Test the allowed actions".into(),
                acceptance_criteria: String::new(),
                base_ref: None,
            },
            &[project],
        )
        .unwrap();
    let snapshot = Snapshot {
        selected: Some(card.id.clone()),
        ..Default::default()
    };
    let actions = [Start, Answer, RequestChanges, Rework, Retry, Back, Cancel];
    let cases: &[(&str, &str, &[BoardAction])] = &[
        ("backlog", "idle", &[Start]),
        ("plan_approval", "idle", &[Answer, RequestChanges]),
        ("final_review", "idle", &[Rework]),
        ("final_review", "failed", &[Rework]),
        ("grill", "queued", &[Cancel]),
        ("grill", "running", &[Cancel]),
        ("grill", "failed", &[Retry, Back]),
        ("implement", "failed", &[Retry, Back]),
        ("code_review", "failed", &[Retry]),
        ("rework", "failed", &[Retry]),
        ("done", "idle", &[]),
    ];
    for &(column, state, expected) in cases {
        card.column_id = column.into();
        card.run_state = state.into();
        for archived in [false, true] {
            card.archived = archived;
            for action in actions {
                assert_eq!(
                    action_allowed(&card, &snapshot, action).is_ok(),
                    !archived && expected.contains(&action),
                    "{column}/{state}/{archived}/{action:?}"
                );
            }
        }
    }
}
