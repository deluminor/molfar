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
