use super::{
    transition,
    types::{BoardAction, BoardAction::*, Position, TransitionEffect::*},
};

fn at<'a>(column: &'a str, run_state: &'a str) -> Position<'a> {
    Position {
        column,
        run_state,
        archived: false,
    }
}

fn next(column: &str, state: &str, action: BoardAction) -> String {
    match transition(at(column, state), action) {
        Ok(result) => {
            let archived = if result.archived { "/archived" } else { "" };
            format!("{}/{}{archived}", result.column, result.run_state)
        }
        Err(reason) => reason,
    }
}

#[test]
fn table_matches_source() {
    let rows = [
        ("backlog", "idle", Start, "grill/queued"),
        ("grill", "running", StageSucceeded, "plan_approval/idle"),
        ("plan_approval", "idle", Answer, "grill/queued"),
        ("plan_approval", "idle", RequestChanges, "grill/queued"),
        ("plan_approval", "idle", ApprovePlan, "implement/queued"),
        ("plan_approval", "idle", EditPlan, "plan_approval/idle"),
        ("backlog", "idle", EditTask, "backlog/idle"),
        ("plan_approval", "idle", EditTask, "plan_approval/idle"),
        ("implement", "running", StageSucceeded, "code_review/queued"),
        ("rework", "running", StageSucceeded, "code_review/queued"),
        (
            "code_review",
            "running",
            StageSucceeded,
            "final_review/idle",
        ),
        ("final_review", "idle", Rework, "rework/queued"),
        ("final_review", "idle", DeliverStart, "final_review/running"),
        (
            "final_review",
            "failed",
            DeliverStart,
            "final_review/running",
        ),
        ("final_review", "running", Deliver, "done/idle"),
        (
            "final_review",
            "running",
            DeliveryFailed,
            "final_review/failed",
        ),
        ("implement", "running", StageFailed, "implement/failed"),
        ("implement", "failed", Retry, "implement/queued"),
        ("grill", "failed", Back, "backlog/idle"),
        ("implement", "failed", Back, "plan_approval/idle"),
        ("code_review", "failed", Back, "final_review/idle"),
        ("rework", "failed", Back, "final_review/idle"),
        ("grill", "running", Cancel, "grill/failed"),
        ("implement", "queued", Cancel, "implement/failed"),
        ("final_review", "idle", Reject, "final_review/idle/archived"),
        ("backlog", "idle", Reject, "backlog/idle/archived"),
        ("done", "idle", Reject, "done/idle/archived"),
    ];

    for (column, state, action, expected) in rows {
        assert_eq!(
            next(column, state, action),
            expected,
            "{column}/{state} + {action:?}"
        );
    }
}

#[test]
fn refusals_match_source() {
    let rows = [
        ("backlog", "idle", ApprovePlan),
        ("grill", "running", Start),
        ("grill", "queued", StageSucceeded),
        ("implement", "running", Retry),
        ("implement", "idle", Back),
        ("plan_approval", "idle", Deliver),
        ("final_review", "idle", Deliver),
        ("final_review", "running", DeliverStart),
        ("final_review", "idle", EditTask),
        ("implement", "running", Reject),
        ("done", "idle", Start),
    ];

    for (column, state, action) in rows {
        let reason = transition(at(column, state), action).unwrap_err();
        assert!(reason.starts_with("Cannot "), "{reason}");
    }
}

#[test]
fn archived_refuses_all_and_done_reject_has_no_cleanup() {
    let archived = Position {
        archived: true,
        ..at("backlog", "idle")
    };
    assert_eq!(
        transition(archived, Start).unwrap_err(),
        "The card is archived."
    );

    let done = transition(at("done", "idle"), Reject).unwrap();

    assert!(done.archived);
    assert!(done.effects.is_empty());
}

#[test]
fn effects_are_named_for_the_caller() {
    let start = transition(at("backlog", "idle"), Start).unwrap();
    let cancel = transition(at("grill", "running"), Cancel).unwrap();
    let deliver = transition(at("final_review", "running"), Deliver).unwrap();
    let changes = transition(at("plan_approval", "idle"), RequestChanges).unwrap();

    assert_eq!(start.effects, [EnsureWorktree, ResetGrillRound]);
    assert_eq!(cancel.effects, [StopSession]);
    assert!(deliver.effects.contains(&CleanupWorktree));
    assert!(changes.effects.contains(&NextGrillRound));
    assert!(!changes.effects.contains(&ResetGrillRound));
}

#[test]
fn manual_gates_cannot_be_skipped() {
    let columns = [
        "backlog",
        "grill",
        "plan_approval",
        "implement",
        "code_review",
        "final_review",
        "rework",
        "done",
    ];
    let states = ["idle", "queued", "running", "failed"];
    let actions = [
        Start,
        StageSucceeded,
        StageFailed,
        Answer,
        RequestChanges,
        ApprovePlan,
        EditPlan,
        EditTask,
        Rework,
        DeliverStart,
        Deliver,
        DeliveryFailed,
        Retry,
        Back,
        Cancel,
        Reject,
    ];

    for column in columns {
        for state in states {
            for action in actions {
                let Ok(result) = transition(at(column, state), action) else {
                    continue;
                };
                if result.column == "implement" && column != "implement" {
                    assert_eq!((column, action), ("plan_approval", ApprovePlan));
                }
                if result.column == "done" && column != "done" {
                    assert_eq!(
                        (column, state, action),
                        ("final_review", "running", Deliver)
                    );
                }
            }
        }
    }
}
