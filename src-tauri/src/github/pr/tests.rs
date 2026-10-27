use super::*;

#[test]
fn parse_gh_pr_list_prefers_open() {
    let json = r#"[{"number":2,"title":"Old","url":"https://example.com/2","state":"MERGED"},{"number":3,"title":"Now","url":"https://example.com/3","state":"OPEN"}]"#;
    let pr = parse_gh_pr_list(json).unwrap();
    assert_eq!(pr.number, 3);
    assert_eq!(pr.state, "open");
    assert_eq!(pr.title, "Now");
}

#[test]
fn pr_head_filter_qualifies_branch_with_repo_owner() {
    assert_eq!(
        github_pr_head_filter("deluminor/molfar", "main").as_deref(),
        Some("deluminor:main")
    );
}

#[test]
fn github_pr_actions_map_to_non_interactive_gh_commands() {
    assert_eq!(
        github_pr_action_args("acme/web", 42, "squash").unwrap(),
        ["pr", "merge", "42", "--repo", "acme/web", "--squash"]
    );
    assert_eq!(
        github_pr_action_args("acme/web", 42, "draft").unwrap(),
        ["pr", "ready", "42", "--repo", "acme/web", "--undo"]
    );
    assert_eq!(
        github_pr_action_args("acme/web", 42, "reopen").unwrap(),
        ["pr", "reopen", "42", "--repo", "acme/web"]
    );
    assert!(github_pr_action_args("acme/web", 42, "delete").is_err());
    assert!(github_pr_action_args("acme/web", 0, "merge").is_err());
    assert!(github_pr_action_args("invalid", 42, "merge").is_err());
}
