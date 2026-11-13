use super::groups::{Group, members, present, versions};
use molfar_core::task_board::{
    stage::contracts::constants::{
        ANSWERS, DELIVERY, IMPL_REPORT, PLAN, PR_DESCRIPTION, QUESTIONS, REVIEW, REWORK_BRIEF, SPEC,
    },
    types::ArtifactMeta,
};

fn meta(kind: &str, version: i64) -> ArtifactMeta {
    ArtifactMeta {
        id: format!("{kind}-{version}"),
        card_id: "card".into(),
        kind: kind.into(),
        version,
        source: "stage".into(),
        stage_run_id: None,
        created_at: version,
    }
}

fn kinds(found: &[(&'static str, ArtifactMeta)]) -> Vec<String> {
    found
        .iter()
        .map(|(_, a)| format!("{}-{}", a.kind, a.version))
        .collect()
}

#[test]
fn grill_round_two_shows_plan_and_questions_but_never_the_task_snapshot() {
    let artifacts = vec![
        meta("task", 1),
        meta(SPEC, 1),
        meta(PLAN, 1),
        meta(QUESTIONS, 1),
        meta(ANSWERS, 1),
        meta(SPEC, 2),
        meta(PLAN, 2),
    ];

    assert_eq!(
        present(&artifacts, "card"),
        vec![Group::Plan, Group::Questions]
    );
    assert_eq!(versions(&artifacts, "card", Group::Plan), vec![2, 1]);
    assert_eq!(
        kinds(&members(&artifacts, "card", Group::Plan, 2)),
        ["spec-2", "plan-2"]
    );
    assert_eq!(
        kinds(&members(&artifacts, "card", Group::Questions, 1)),
        ["questions-1", "answers-1"]
    );
    assert!(present(&artifacts, "other").is_empty());
}

#[test]
fn review_cycle_matches_exactly_and_delivery_carries_the_latest_record() {
    let artifacts = vec![
        meta(IMPL_REPORT, 1),
        meta(REVIEW, 1),
        meta(REWORK_BRIEF, 1),
        meta(IMPL_REPORT, 2),
        meta(REVIEW, 2),
        meta(PR_DESCRIPTION, 1),
        meta(PR_DESCRIPTION, 2),
        meta(DELIVERY, 1),
    ];

    assert_eq!(
        kinds(&members(&artifacts, "card", Group::Review, 2)),
        ["impl_report-2", "review-2"]
    );
    assert_eq!(
        kinds(&members(&artifacts, "card", Group::Review, 1)),
        ["impl_report-1", "review-1", "rework_brief-1"]
    );
    assert_eq!(
        kinds(&members(&artifacts, "card", Group::Delivery, 2)),
        ["pr_description-2", "delivery-1"]
    );
}

#[test]
fn group_ids_round_trip_and_versions_read_naturally() {
    for group in Group::ALL {
        assert_eq!(Group::parse(group.id()), Some(group));
    }
    assert_eq!(Group::parse("task"), None);
    assert_eq!(Group::Plan.version_label(2), "v2");
    assert_eq!(Group::Questions.version_label(1), "Round 1");
    assert_eq!(Group::Review.version_label(3), "Cycle 3");
}
