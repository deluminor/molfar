use super::*;

#[test]
fn parse_github_work_item_details_reads_body_and_author() {
    let json = r#"{
            "body": "Steps to reproduce",
            "author": {"login": "maya"}
        }"#;
    let details = parse_github_work_item_details(json).unwrap();
    assert_eq!(details.body, "Steps to reproduce");
    assert_eq!(details.author, "maya");
    assert_eq!(
        details.author_avatar_url,
        "https://avatars.githubusercontent.com/maya?s=64"
    );
    assert_eq!(details.base_ref_name, "");
    assert_eq!(details.review_decision, "");
}

#[test]
fn parse_github_work_item_details_reads_pr_review_meta() {
    let json = r#"{
            "body": "Move the banner",
            "author": {"login": "ayush-porwal"},
            "baseRefName": "main",
            "headRefName": "agent-terminal",
            "reviewDecision": "REVIEW_REQUIRED"
        }"#;
    let details = parse_github_work_item_details(json).unwrap();
    assert_eq!(details.base_ref_name, "main");
    assert_eq!(details.head_ref_name, "agent-terminal");
    assert_eq!(details.review_decision, "REVIEW_REQUIRED");
}
