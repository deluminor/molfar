use super::{
    record,
    text::{
        base_branch, pull_request_body, pull_request_number, pull_request_title, spec_pr_title,
    },
    types::{Delivery, DeliveryMethod, PullRequestDocs},
};
use crate::task_board::stage::contracts::{review, types::CodeReview};

fn approved() -> CodeReview {
    review::parse("Verdict: APPROVE").unwrap()
}

#[test]
fn spec_pr_title_reads_frontmatter_only_and_limits_length() {
    assert_eq!(
        spec_pr_title("---\npr_title: \"feat(board): add task board\"\n---\n# Spec").as_deref(),
        Some("feat(board): add task board")
    );
    assert_eq!(spec_pr_title("# Spec\npr_title: nope"), None);
    assert_eq!(
        spec_pr_title("\r\n---\r\npr_title: 'fix: crlf'\r\n---").as_deref(),
        Some("fix: crlf")
    );
    let long = format!("---\npr_title: {}\n---", "x".repeat(121));
    assert_eq!(spec_pr_title(&long), None);
}

#[test]
fn title_prefers_spec_then_card() {
    assert_eq!(
        pull_request_title("Board", Some("---\npr_title: \"feat: board\"\n---")),
        "feat: board"
    );
    assert_eq!(pull_request_title("Board", None), "Board");
}

#[test]
fn body_uses_pr_description_with_verdict_footer() {
    let review = approved();
    let body = pull_request_body(
        3,
        "Do it",
        PullRequestDocs {
            pr_description: Some("### Summary\n\nAdds X."),
            review: Some(&review),
            ..Default::default()
        },
    );

    assert_eq!(
        body,
        "### Summary\n\nAdds X.\n\n---\n\nCode review: **approved**, 0 findings. Task Board card #3."
    );
}

#[test]
fn body_falls_back_to_task_and_nested_report() {
    let body = pull_request_body(
        3,
        "Do it",
        PullRequestDocs {
            impl_report: Some("# Implementation report\n## Summary\nDone.\n##### Deep\n#### Four"),
            ..Default::default()
        },
    );

    assert!(body.contains("### Summary\n\nDo it"));
    assert!(body.contains("### Implementation\n\n#### Summary\nDone.\n##### Deep\n###### Four"));
    assert!(!body.lines().any(|line| line.starts_with("# ")));
    assert!(body.ends_with("---\n\nTask Board card #3."));
}

#[test]
fn body_is_capped_and_blank_description_falls_back() {
    let huge = "y".repeat(70_000);
    let body = pull_request_body(
        1,
        "Task",
        PullRequestDocs {
            pr_description: Some(&huge),
            ..Default::default()
        },
    );
    assert_eq!(body.len(), 60_000);

    let blank = pull_request_body(
        1,
        "Task",
        PullRequestDocs {
            pr_description: Some("   "),
            ..Default::default()
        },
    );
    assert!(blank.starts_with("### Summary\n\nTask"));
}

#[test]
fn pull_request_numbers_come_from_github_urls() {
    assert_eq!(
        pull_request_number("https://github.com/a/b/pull/42"),
        Some(42)
    );
    assert_eq!(
        pull_request_number("https://github.com/a/b/pull/42/files"),
        Some(42)
    );
    assert_eq!(pull_request_number("https://github.com/a/b/pull/0"), None);
    assert_eq!(pull_request_number("https://github.com/a/b"), None);
}

#[test]
fn base_branch_normalizes_stored_refs() {
    let remotes = vec!["origin".to_owned(), "upstream".to_owned()];

    assert_eq!(base_branch("refs/remotes/origin/main", &remotes), "main");
    assert_eq!(
        base_branch("refs/remotes/origin/release/1.0", &remotes),
        "release/1.0"
    );
    assert_eq!(base_branch("refs/heads/develop", &remotes), "develop");
    assert_eq!(base_branch("upstream/main", &remotes), "main");
    assert_eq!(base_branch(" main ", &remotes), "main");
    assert_eq!(base_branch("feature/x", &remotes), "feature/x");
}

#[test]
fn delivery_record_round_trips_and_tolerates_unknown_shapes() {
    let delivery = Delivery {
        method: DeliveryMethod::Merge,
        delivered_at: 0,
        pr_url: Some("https://github.com/a/b/pull/1".into()),
        merged: true,
    };
    let json = record::to_json(&delivery).unwrap();

    assert_eq!(
        json,
        r#"{"method":"merge","deliveredAt":0,"prUrl":"https://github.com/a/b/pull/1","merged":true}"#
    );
    assert_eq!(record::parse(Some(&json)), Some(delivery));
    assert_eq!(
        record::to_json(&Delivery {
            method: DeliveryMethod::Keep,
            delivered_at: 5,
            pr_url: None,
            merged: false,
        })
        .unwrap(),
        r#"{"method":"keep","deliveredAt":5}"#
    );
    assert_eq!(record::parse(Some(r#"{"url":"preserve"}"#)), None);
    assert_eq!(record::parse(Some("not json")), None);
    assert_eq!(record::parse(None), None);
    let loose = record::parse(Some(
        r#"{"method":"pr","deliveredAt":"x","merged":"yes","prUrl":7}"#,
    ))
    .unwrap();
    assert_eq!(
        (loose.delivered_at, loose.merged, loose.pr_url.clone()),
        (0, false, None)
    );
    assert!(record::to_artifact(&loose)
        .unwrap()
        .contains("\n  \"method\": \"pr\""));
}
